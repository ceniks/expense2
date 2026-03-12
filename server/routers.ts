import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut } from "./storage";
import * as db from "./db";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Convert a PDF buffer to a PNG buffer using pdftoppm (first page only) */
function pdfBufferToPngBuffer(pdfBuffer: Buffer): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nf-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outPrefix = path.join(tmpDir, "page");
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    // -r 150 = 150 DPI (good quality, reasonable size), -png = PNG output, -l 1 = only first page
    execSync(`pdftoppm -r 150 -png -l 1 "${pdfPath}" "${outPrefix}"`, { timeout: 30000 });
    // pdftoppm creates files like page-1.png
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".png"));
    if (files.length === 0) throw new Error("pdftoppm did not produce any PNG output");
    files.sort();
    return fs.readFileSync(path.join(tmpDir, files[0]));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Convert ALL pages of a PDF to PNG buffers (one per page) */
function pdfAllPagesToPngBuffers(pdfBuffer: Buffer): Buffer[] {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "payroll-pdf-"));
  const pdfPath = path.join(tmpDir, "input.pdf");
  const outPrefix = path.join(tmpDir, "page");
  try {
    fs.writeFileSync(pdfPath, pdfBuffer);
    execSync(`pdftoppm -r 120 -png "${pdfPath}" "${outPrefix}"`, { timeout: 120000 });
    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".png")).sort();
    return files.map((f) => fs.readFileSync(path.join(tmpDir, f)));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Extract a single page from a PDF as a PDF buffer (1-indexed page number) */
function extractPdfPage(pdfBuffer: Buffer, pageNumber: number): Buffer {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "payroll-page-"));
  const inPath = path.join(tmpDir, "input.pdf");
  const outPath = path.join(tmpDir, "page.pdf");
  try {
    fs.writeFileSync(inPath, pdfBuffer);
    execSync(`pdfseparate -f ${pageNumber} -l ${pageNumber} "${inPath}" "${outPath}"`, { timeout: 30000 });
    return fs.readFileSync(outPath);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Extract payroll data from a single page image via LLM */
async function extractPayrollFromImage(imageUrl: string): Promise<{
  employeeName: string;
  position: string;
  baseSalary: number;
  netSalary: number;
  advanceAmount: number;
  vtDaily: number;
  competenceMonth: number;
  competenceYear: number;
  rawData: Record<string, any>;
} | null> {
  const messages: Message[] = [
    {
      role: "system",
      content: `Você é um especialista em leitura de holerites brasileiros.
Analise a imagem do holerite e extraia as informações.

IMPORTANTE: O holerite pode ter DUAS VIAS idênticas na mesma página (uma em cima, outra embaixo). Extraia os dados de UMA via apenas.

Retorne um JSON com os campos:
- employeeName: string (nome completo do funcionário, em maiúsculas como no holerite)
- position: string (cargo/função do funcionário)
- baseSalary: number (Salário Base do rodapé do holerite)
- netSalary: number (Total Líquido do holerite)
- advanceAmount: number (valor do desconto "Adiantamento Anterior" código 12, ou "Desc. Adiantamento" código 1008, ou 0 se não houver)
- vtDaily: number (valor diário do VT = valor total do "Desc. Vale Transporte" dividido pelos dias de referência, ou 0 se não houver)
- competenceMonth: number (mês de competência, ex: 2 para Fevereiro)
- competenceYear: number (ano de competência, ex: 2026)
- rawData: object (objeto com todos os itens de vencimentos e descontos encontrados, chave = descrição, valor = número)

Se não conseguir identificar o holerite (página em branco, assinatura, etc.), retorne null.
Se for uma segunda via idêntica de um holerite já extraído, retorne null.
Retorne APENAS o JSON, sem markdown.`,
    },
    {
      role: "user",
      content: [
        { type: "text", text: "Extraia os dados deste holerite:" },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ],
    },
  ];

  try {
    const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
    const rawContent = response.choices[0]?.message?.content ?? "";
    const text = (typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent)).trim();
    const parsed = JSON.parse(text);
    if (!parsed || !parsed.employeeName) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Process all pages of a payroll PDF and save pending payrolls */
async function extractAllPayrollsFromPdf(pdfBuffer: Buffer, userId: number): Promise<{
  processed: number;
  total: number;
  errors: string[];
}> {
  const pageBuffers = pdfAllPagesToPngBuffers(pdfBuffer);
  const errors: string[] = [];
  let processed = 0;
  const seenEmployees = new Set<string>();

  for (let i = 0; i < pageBuffers.length; i++) {
    try {
      const imgFileName = `payrolls/pages/${Date.now()}_${i}.png`;
      const { url: imgUrl } = await storagePut(imgFileName, pageBuffers[i], "image/png");
      const data = await extractPayrollFromImage(imgUrl);
      if (!data) continue;
      // Skip duplicate vias (same employee already processed)
      if (seenEmployees.has(data.employeeName)) continue;
      seenEmployees.add(data.employeeName);

      // Extract this specific page as an individual PDF for download
      let individualPdfUrl: string | undefined;
      try {
        const pageNum = i + 1; // pdfseparate uses 1-indexed pages
        const pagePdfBuffer = extractPdfPage(pdfBuffer, pageNum);
        const pagePdfFileName = `payrolls/individual/${Date.now()}_${data.employeeName.replace(/\s+/g, "_")}.pdf`;
        const { url } = await storagePut(pagePdfFileName, pagePdfBuffer, "application/pdf");
        individualPdfUrl = url;
      } catch {
        // If individual extraction fails, fall back to no PDF (not critical)
      }

      await db.upsertPayrollFromPdf(userId, {
        employeeName: data.employeeName,
        position: data.position,
        baseSalary: String(data.baseSalary),
        netSalary: String(data.netSalary),
        advanceAmount: String(data.advanceAmount),
        vtDaily: String(data.vtDaily),
        competenceMonth: data.competenceMonth,
        competenceYear: data.competenceYear,
        rawData: data.rawData,
        pdfUrl: individualPdfUrl,
      });
      processed++;
    } catch (err: any) {
      errors.push(`Página ${i + 1}: ${err?.message ?? "Erro desconhecido"}`);
    }
  }

  return { processed, total: pageBuffers.length, errors };
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── AI Image Analysis ──────────────────────────────────────────────────────
  analyzePaymentImage: publicProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }) => {
      const imageBuffer = Buffer.from(input.imageBase64, "base64");
      const fileName = `payments/temp_${Date.now()}.jpg`;
      const { url: imageUrl } = await storagePut(fileName, imageBuffer, "image/jpeg");

      const messages: Message[] = [
        {
          role: "system",
          content: `Você é um assistente especializado em extrair informações de comprovantes de pagamento brasileiros.
Analise a imagem e extraia as informações do pagamento.

REGRAS IMPORTANTES para o campo "description":
- Em comprovantes de Pix, boleto ou transferência: use o nome de quem RECEBEU o pagamento (campo "Para", "Favorecido", "Destinatário" ou "Beneficiário"). NUNCA use o nome de quem enviou (campo "De", "Pagador" ou "Remetente").
- Em comprovantes de cartão, nota fiscal ou recibo: use o nome do estabelecimento comercial ou serviço.
- Máximo 60 caracteres.

Retorne um JSON com os campos:
- description: string (nome de quem RECEBEU o pagamento ou do estabelecimento, máximo 60 caracteres)
- amount: number (valor em reais, como número decimal, ex: 49.90)
- date: string (data no formato YYYY-MM-DD)
- category: string (uma das opções: Alimentação, Transporte, Saúde, Moradia, Lazer, Educação, Vestuário, Serviços, Outros)

Se não conseguir extrair algum campo, retorne null para ele.`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia as informações deste comprovante de pagamento:" },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ],
        },
      ];

      const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
      const rawContent = response.choices[0]?.message?.content ?? "{}";
      const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(content); } catch { /* ignore */ }

      return {
        description: typeof data.description === "string" ? data.description : null,
        amount: typeof data.amount === "number" ? data.amount : null,
        date: typeof data.date === "string" ? data.date : null,
        category: typeof data.category === "string" ? data.category : null,
      };
    }),

  // ─── Upload Receipt Image to S3 ─────────────────────────────────────────────
  uploadReceiptImage: protectedProcedure
    .input(z.object({ imageBase64: z.string(), mimeType: z.string().default("image/jpeg") }))
    .mutation(async ({ ctx, input }) => {
      const imageBuffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.mimeType.includes("png") ? "png" : "jpg";
      const fileName = `receipts/${ctx.user.id}/${Date.now()}.${ext}`;
      const { url } = await storagePut(fileName, imageBuffer, input.mimeType);
      return { url };
    }),

  // ─── Payments ───────────────────────────────────────────────────────────────
  payments: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserPayments(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        description: z.string().min(1).max(500),
        amount: z.number().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        category: z.string().min(1).max(100),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        imageUrl: z.string().url().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ ctx, input }) =>
        db.createPayment({
          userId: ctx.user.id,
          description: input.description,
          amount: String(input.amount),
          date: input.date,
          category: input.category,
          profile: input.profile,
          imageUrl: input.imageUrl ?? null,
          notes: input.notes ?? null,
        })
      ),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        description: z.string().min(1).max(500).optional(),
        amount: z.number().positive().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        category: z.string().min(1).max(100).optional(),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
        imageUrl: z.string().url().optional().nullable(),
        notes: z.string().optional().nullable(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, amount, ...rest } = input;
        return db.updatePayment(id, ctx.user.id, {
          ...rest,
          ...(amount !== undefined ? { amount: String(amount) } : {}),
        });
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deletePayment(input.id, ctx.user.id)),
  }),

  // ─── Categories ─────────────────────────────────────────────────────────────
  categories: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserCategories(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        color: z.string().min(1).max(20),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
      }))
      .mutation(({ ctx, input }) =>
        db.createCategory({ userId: ctx.user.id, name: input.name, color: input.color, profile: input.profile ?? "Empresa" })
      ),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().min(1).max(20).optional(),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...rest } = input;
        return db.updateCategory(id, ctx.user.id, rest);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteCategory(input.id, ctx.user.id)),
  }),

  // ─── Shared Groups ──────────────────────────────────────────────────────────
  sharing: router({
    /** Get current user's group info (creates a solo group if none exists) */
    myGroup: protectedProcedure.query(async ({ ctx }) => {
      const group = await db.getOrCreateUserGroup(ctx.user.id);
      if (!group) return null;
      const members = await db.getGroupMembers(group.id);
      return { ...group, members };
    }),

    /** Join a group using an invite code */
    joinGroup: protectedProcedure
      .input(z.object({ inviteCode: z.string().min(1).max(16) }))
      .mutation(async ({ ctx, input }) => {
        const group = await db.joinGroupByInviteCode(ctx.user.id, input.inviteCode);
        const members = await db.getGroupMembers(group.id);
        return { ...group, members };
      }),

    /** Leave the current shared group (only if it has more than 1 member) */
    leaveGroup: protectedProcedure
      .mutation(async ({ ctx }) => {
        await db.leaveGroup(ctx.user.id);
        return { success: true };
      }),

    /** Regenerate the invite code (only group creator) */
    regenerateCode: protectedProcedure
      .mutation(async ({ ctx }) => {
        const group = await db.getOrCreateUserGroup(ctx.user.id);
        if (!group) throw new Error("Grupo não encontrado.");
        const newCode = await db.regenerateInviteCode(group.id, ctx.user.id);
        return { inviteCode: newCode };
      }),
  }),

  // ─── Invoices (Notas Fiscais) ────────────────────────────────────────────────
  invoices: router({
    list: protectedProcedure.query(({ ctx }) => db.getUserInvoices(ctx.user.id)),

    /** Analyze a NF image or PDF with AI and return extracted data */
    analyze: protectedProcedure
      .input(z.object({
        imageBase64: z.string(),
        mimeType: z.string().optional().default("image/jpeg"),
      }))
      .mutation(async ({ ctx, input }) => {
        const mime = input.mimeType || "image/jpeg";
        const isPdf = mime === "application/pdf";
        const rawBuffer = Buffer.from(input.imageBase64, "base64");

        // For PDFs: convert first page to PNG so the LLM can see the visual content
        const imageBuffer = isPdf ? pdfBufferToPngBuffer(rawBuffer) : rawBuffer;
        const imageMime = isPdf ? "image/png" : mime;
        const ext = isPdf ? "png" : "jpg";

        // Store the rendered image (not the original PDF) for display
        const fileName = `invoices/${ctx.user.id}/${Date.now()}.${ext}`;
        const { url: imageUrl } = await storagePut(fileName, imageBuffer, imageMime as any);

        // Always send as image_url — LLM can now see the rendered PDF page
        const userContent: any[] = [
          { type: "text", text: "Extraia as informações desta Nota Fiscal:" },
          { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        ];

        const messages: Message[] = [
          {
            role: "system",
            content: `Você é um assistente especializado em extrair informações de Notas Fiscais Eletrônicas (NF-e/DANFE) brasileiras.
Analise a imagem da nota fiscal com atenção especial à seção de DUPLICATAS/COBRANÇA.

Retorne um JSON com os campos:
- supplierName: string (nome do fornecedor/empresa emissora, máximo 200 caracteres)
- totalAmount: number (valor total da nota em reais, como número decimal, ex: 41328.75)
- issueDate: string (data de emissão no formato YYYY-MM-DD)
- description: string (breve descrição dos produtos/serviços, máximo 200 caracteres)
- category: string (uma das opções: Alimentação, Transporte, Saúde, Moradia, Lazer, Educação, Vestuário, Serviços, Outros)
- installments: array de objetos com as DUPLICATAS encontradas na seção "DUPLICATAS" ou "COBRANÇA" da NF.
  Cada objeto deve ter:
  - number: number (número da duplicata, ex: 1, 2, 3)
  - amount: number (valor da duplicata em reais, como decimal, ex: 13776.25)
  - dueDate: string (data de vencimento no formato YYYY-MM-DD)

REGRAS IMPORTANTES:
1. SEMPRE extraia as duplicatas reais da seção DUPLICATAS/COBRANÇA se ela existir na imagem.
2. NÃO invente parcelas nem calcule com base no valor total.
3. Se não houver seção de duplicatas, retorne installments como array vazio [].
4. Datas no formato brasileiro (DD/MM/AAAA) devem ser convertidas para YYYY-MM-DD.
5. Valores com vírgula como separador decimal (ex: R$ 13.776,25) devem ser convertidos para decimal (13776.25).

Se não conseguir extrair algum campo, retorne null para ele.`,
          },
          {
            role: "user",
            content: userContent,
          },
        ];

        const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
        const rawContent = response.choices[0]?.message?.content ?? "{}";
        const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(content); } catch { /* ignore */ }

        // Parse installments from AI response
        const rawInstallments = Array.isArray(data.installments) ? data.installments : [];
        const parsedInstallments: { number: number; amount: number; dueDate: string }[] = rawInstallments
          .filter((inst: any) => inst && typeof inst.amount === "number" && typeof inst.dueDate === "string")
          .map((inst: any, idx: number) => ({
            number: typeof inst.number === "number" ? inst.number : idx + 1,
            amount: inst.amount,
            dueDate: inst.dueDate,
          }))
          .slice(0, 12); // safety cap

        // Fallback: if no installments extracted, suggest based on total amount
        const totalAmt = typeof data.totalAmount === "number" ? data.totalAmount : 0;
        const suggestedCount = parsedInstallments.length > 0 ? parsedInstallments.length
          : totalAmt <= 500 ? 1 : totalAmt <= 1000 ? 2 : totalAmt <= 3000 ? 3
          : totalAmt <= 6000 ? 4 : totalAmt <= 10000 ? 5 : 6;

        return {
          imageUrl,
          supplierName: typeof data.supplierName === "string" ? data.supplierName : null,
          totalAmount: typeof data.totalAmount === "number" ? data.totalAmount : null,
          issueDate: typeof data.issueDate === "string" ? data.issueDate : null,
          description: typeof data.description === "string" ? data.description : null,
          suggestedInstallments: Math.min(12, Math.max(1, suggestedCount)),
          installments: parsedInstallments,
          category: typeof data.category === "string" ? data.category : "Outros",
        };
      }),

    /** Create a NF with its installments */
    create: protectedProcedure
      .input(z.object({
        supplierName: z.string().min(1).max(300),
        totalAmount: z.number().positive(),
        issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(500).optional().nullable(),
        imageUrl: z.string().url().optional().nullable(),
        profile: z.enum(["Pessoal", "Empresa"]).default("Empresa"),
        category: z.string().min(1).max(100).default("Outros"),
        installments: z.array(z.object({
          installmentNumber: z.number().int().min(1).max(6),
          amount: z.number().positive(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).min(1).max(6),
      }))
      .mutation(({ ctx, input }) =>
        db.createInvoiceWithInstallments({
          userId: ctx.user.id,
          supplierName: input.supplierName,
          totalAmount: String(input.totalAmount),
          issueDate: input.issueDate,
          description: input.description ?? null,
          imageUrl: input.imageUrl ?? null,
          profile: input.profile,
          category: input.category,
          installments: input.installments.map((i) => ({
            installmentNumber: i.installmentNumber,
            amount: String(i.amount),
            dueDate: i.dueDate,
          })),
        })
      ),

    /** Mark an installment as paid — creates a Payment record */
    markPaid: protectedProcedure
      .input(z.object({
        installmentId: z.number(),
        paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }))
      .mutation(({ ctx, input }) =>
        db.markInstallmentPaid(input.installmentId, ctx.user.id, input.paidDate)
      ),

    /** Unmark a paid installment — removes the linked Payment record */
    markUnpaid: protectedProcedure
      .input(z.object({ installmentId: z.number() }))
      .mutation(({ ctx, input }) =>
        db.markInstallmentUnpaid(input.installmentId, ctx.user.id)
      ),

    /** Mark installment as already paid — no payment record, excluded from reports */
    markAsAlreadyPaid: protectedProcedure
      .input(z.object({ installmentId: z.number() }))
      .mutation(({ ctx, input }) =>
        db.markInstallmentAlreadyPaid(input.installmentId, ctx.user.id)
      ),

    /** Unmark an installment previously marked as already paid */
    unmarkAlreadyPaid: protectedProcedure
      .input(z.object({ installmentId: z.number() }))
      .mutation(({ ctx, input }) =>
        db.unmarkInstallmentAlreadyPaid(input.installmentId, ctx.user.id)
      ),

    /** Delete an invoice and all its installments + linked payments */
    delete: protectedProcedure
      .input(z.object({ invoiceId: z.number() }))
      .mutation(({ ctx, input }) =>
        db.deleteInvoice(input.invoiceId, ctx.user.id)
      ),

    /** Update invoice header and replace installments */
    update: protectedProcedure
      .input(z.object({
        invoiceId: z.number(),
        supplierName: z.string().min(1).max(300),
        totalAmount: z.number().positive(),
        issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(500).optional().nullable(),
        profile: z.enum(["Pessoal", "Empresa"]).default("Empresa"),
        category: z.string().min(1).max(100).default("Outros"),
        installments: z.array(z.object({
          installmentNumber: z.number().int().min(1),
          amount: z.number().positive(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).min(1).max(12),
      }))
      .mutation(({ ctx, input }) =>
        db.updateInvoice(input.invoiceId, ctx.user.id, {
          supplierName: input.supplierName,
          totalAmount: String(input.totalAmount),
          issueDate: input.issueDate,
          description: input.description ?? null,
          profile: input.profile,
          category: input.category,
          installments: input.installments.map((i) => ({
            installmentNumber: i.installmentNumber,
            amount: String(i.amount),
            dueDate: i.dueDate,
          })),
        })
      ),

    /** Return all installments ordered by dueDate for the agenda view */
    schedule: protectedProcedure.query(({ ctx }) =>
      db.getInstallmentSchedule(ctx.user.id)
    ),

    /** Return unified schedule: invoices + financings + monthly bills */
    unified: protectedProcedure.query(({ ctx }) =>
      db.getUnifiedSchedule(ctx.user.id)
    ),
  }),

  // ─── Financiamentos ────────────────────────────────────────────────────────
  financings: router({
    list: protectedProcedure.query(({ ctx }) => db.listFinancings(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(300),
        totalAmount: z.number().positive(),
        installmentAmount: z.number().positive(),
        totalInstallments: z.number().int().min(1).max(240),
        paidInstallments: z.number().int().min(0).default(0),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dueDay: z.number().int().min(1).max(31),
        category: z.string().min(1).max(100).default("Financiamento"),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        notes: z.string().max(1000).optional().nullable(),
      }))
      .mutation(({ ctx, input }) => db.createFinancing(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(300).optional(),
        totalAmount: z.number().positive().optional(),
        installmentAmount: z.number().positive().optional(),
        totalInstallments: z.number().int().min(1).max(240).optional(),
        paidInstallments: z.number().int().min(0).optional(),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
        category: z.string().min(1).max(100).optional(),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
        notes: z.string().max(1000).optional().nullable(),
      }))
      .mutation(({ ctx, input }) => db.updateFinancing(ctx.user.id, input)),
    registerPayment: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.registerFinancingPayment(ctx.user.id, input.id)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteFinancing(ctx.user.id, input.id)),
  }),

  // ─── Importação em Lote ────────────────────────────────────────────────────
  importData: protectedProcedure
    .input(z.object({
      payments: z.array(z.object({
        description: z.string().min(1).max(500),
        amount: z.number().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        category: z.string().min(1).max(100),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        notes: z.string().max(1000).optional().nullable(),
        imageUri: z.string().optional().nullable(),
      })).optional().default([]),
      categories: z.array(z.object({
        name: z.string().min(1).max(100),
        color: z.string().min(1).max(20),
      })).optional().default([]),
      financings: z.array(z.object({
        name: z.string().min(1).max(300),
        totalAmount: z.number().positive(),
        installmentAmount: z.number().positive(),
        totalInstallments: z.number().int().min(1).max(240),
        paidInstallments: z.number().int().min(0).default(0),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dueDay: z.number().int().min(1).max(31),
        category: z.string().min(1).max(100).default("Financiamento"),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        notes: z.string().max(1000).optional().nullable(),
      })).optional().default([]),
      monthlyBills: z.array(z.object({
        name: z.string().min(1).max(300),
        amount: z.number().positive(),
        dueDay: z.number().int().min(1).max(31),
        category: z.string().min(1).max(100).default("Contas"),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        notes: z.string().max(1000).optional().nullable(),
      })).optional().default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const errors: string[] = [];

      // Obter groupId do usuário uma única vez
      const dbInstance = await db.getDb();
      if (!dbInstance) throw new Error("Database not available");

      const { groupMembers: groupMembersTable, categories: categoriesTable, payments: paymentsTable, financings: financingsTable, monthlyBills: monthlyBillsTable } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const membership = await dbInstance
        .select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.userId, userId))
        .limit(1);
      const groupId = membership.length > 0 ? membership[0].groupId : null;

      // Importar categorias em lote (ignorar duplicatas)
      let categoriesImported = 0;
      if (input.categories.length > 0) {
        try {
          const catValues = input.categories.map((cat) => ({
            userId,
            groupId,
            name: cat.name,
            color: cat.color,
          }));
          // Insert ignore duplicates one by one to count successes
          for (const cat of catValues) {
            try {
              await dbInstance.insert(categoriesTable).values(cat);
              categoriesImported++;
            } catch (e: any) {
              if (!e?.message?.includes("Duplicate")) errors.push(`Categoria "${cat.name}": ${e?.message}`);
            }
          }
        } catch (e: any) {
          errors.push(`Categorias: ${e?.message}`);
        }
      }

      // Importar pagamentos em lote
      let paymentsImported = 0;
      if (input.payments.length > 0) {
        try {
          const payValues = input.payments.map((p) => ({
            userId,
            groupId,
            description: p.description,
            amount: String(p.amount),
            date: p.date,
            category: p.category,
            profile: p.profile,
            notes: p.notes ?? null,
            imageUrl: (p.imageUri?.startsWith("http") ? p.imageUri : null) ?? null,
          }));
          await dbInstance.insert(paymentsTable).values(payValues);
          paymentsImported = payValues.length;
        } catch (e: any) {
          errors.push(`Pagamentos: ${e?.message}`);
        }
      }

      // Importar financiamentos em lote
      let financingsImported = 0;
      if (input.financings.length > 0) {
        try {
          const finValues = input.financings.map((f) => ({
            userId,
            groupId,
            name: f.name,
            totalAmount: String(f.totalAmount),
            installmentAmount: String(f.installmentAmount),
            totalInstallments: f.totalInstallments,
            paidInstallments: f.paidInstallments ?? 0,
            startDate: f.startDate,
            dueDay: f.dueDay,
            category: f.category ?? "Financiamento",
            profile: f.profile ?? "Pessoal",
            notes: f.notes ?? null,
          }));
          await dbInstance.insert(financingsTable).values(finValues);
          financingsImported = finValues.length;
        } catch (e: any) {
          errors.push(`Financiamentos: ${e?.message}`);
        }
      }

      // Importar contas mensais em lote
      let monthlyBillsImported = 0;
      if (input.monthlyBills.length > 0) {
        try {
          const billValues = input.monthlyBills.map((b) => ({
            userId,
            groupId,
            name: b.name,
            amount: String(b.amount),
            dueDay: b.dueDay,
            category: b.category ?? "Contas",
            profile: b.profile ?? "Pessoal",
            notes: b.notes ?? null,
            isActive: true,
          }));
          await dbInstance.insert(monthlyBillsTable).values(billValues);
          monthlyBillsImported = billValues.length;
        } catch (e: any) {
          errors.push(`Contas mensais: ${e?.message}`);
        }
      }

      return { paymentsImported, categoriesImported, financingsImported, monthlyBillsImported, errors };
    }),

  // ─── Notas Fiscais Pendentes (recebidas por e-mail) ────────────────────────────────────────────────
  pendingInvoices: router({
    /** Listar NFs pendentes do usuário */
    list: protectedProcedure.query(async ({ ctx }) => {
      const { pendingInvoices: tbl } = await import("../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const dbInst = await db.getDb();
      if (!dbInst) return [];
      return dbInst
        .select()
        .from(tbl)
        .where(and(eq(tbl.userId, ctx.user.id), eq(tbl.status, "pending")))
        .orderBy(tbl.createdAt);
    }),

    /** Aprovar uma NF pendente: salva como invoice com parcelas */
    approve: protectedProcedure
      .input(z.object({
        id: z.number(),
        supplierName: z.string().min(1).max(300),
        totalAmount: z.number().positive(),
        issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().max(500).optional().nullable(),
        profile: z.enum(["Pessoal", "Empresa"]).default("Empresa"),
        category: z.string().min(1).max(100).default("Outros"),
        installments: z.array(z.object({
          installmentNumber: z.number().int().min(1),
          amount: z.number().positive(),
          dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })).min(1).max(12),
      }))
      .mutation(async ({ ctx, input }) => {
        const { pendingInvoices: tbl } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const dbInst = await db.getDb();
        if (!dbInst) throw new Error("DB not available");

        // Get the pending invoice to copy imageUrl
        const rows = await dbInst.select().from(tbl)
          .where(and(eq(tbl.id, input.id), eq(tbl.userId, ctx.user.id)))
          .limit(1);
        if (rows.length === 0) throw new Error("Nota fiscal não encontrada");
        const pending = rows[0];

        // Create the invoice
        await db.createInvoiceWithInstallments({
          userId: ctx.user.id,
          supplierName: input.supplierName,
          totalAmount: String(input.totalAmount),
          issueDate: input.issueDate,
          description: input.description ?? null,
          imageUrl: pending.imageUrl ?? null,
          profile: input.profile,
          category: input.category,
          installments: input.installments.map((i) => ({
            installmentNumber: i.installmentNumber,
            amount: String(i.amount),
            dueDate: i.dueDate,
          })),
        });

        // Mark as approved
        await dbInst.update(tbl)
          .set({ status: "approved" })
          .where(eq(tbl.id, input.id));

        return { success: true };
      }),

    /** Rejeitar uma NF pendente */
    reject: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { pendingInvoices: tbl } = await import("../drizzle/schema");
        const { eq, and } = await import("drizzle-orm");
        const dbInst = await db.getDb();
        if (!dbInst) throw new Error("DB not available");
        await dbInst.update(tbl)
          .set({ status: "rejected" })
          .where(and(eq(tbl.id, input.id), eq(tbl.userId, ctx.user.id)));
        return { success: true };
      }),
  }),

  // ─── Contas Mensais ────────────────────────────────────────────────────────
  monthlyBills: router({
    list: protectedProcedure.query(({ ctx }) => db.listMonthlyBills(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(300),
        amount: z.number().positive(),
        dueDay: z.number().int().min(1).max(31),
        category: z.string().min(1).max(100).default("Contas"),
        profile: z.enum(["Pessoal", "Empresa"]).default("Pessoal"),
        notes: z.string().max(1000).optional().nullable(),
      }))
      .mutation(({ ctx, input }) => db.createMonthlyBill(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(300).optional(),
        amount: z.number().positive().optional(),
        dueDay: z.number().int().min(1).max(31).optional(),
        category: z.string().min(1).max(100).optional(),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
        isActive: z.boolean().optional(),
        notes: z.string().max(1000).optional().nullable(),
      }))
      .mutation(({ ctx, input }) => db.updateMonthlyBill(ctx.user.id, input)),
    pay: protectedProcedure
      .input(z.object({
        id: z.number(),
        amount: z.number().positive().optional(),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
      }))
      .mutation(({ ctx, input }) => db.payMonthlyBill(ctx.user.id, input)),
    unpay: protectedProcedure
      .input(z.object({ id: z.number(), yearMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(({ ctx, input }) => db.unpayMonthlyBill(ctx.user.id, input.id, input.yearMonth)),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteMonthlyBill(ctx.user.id, input.id)),
  }),

  // ─── Funcionários ────────────────────────────────────────────────────────────
  employees: router({
    list: protectedProcedure
      .query(({ ctx }) => db.listEmployees(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({
        fullName: z.string().min(1),
        role: z.string().default(""),
        baseSalary: z.string().default("0"),
        admissionDate: z.string().default(""),
        pixKey: z.string().default(""),
        email: z.string().email().optional().or(z.literal("")),
        vtDaily: z.string().default("0"),
        vaDaily: z.string().default("0"),
        notes: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => db.createEmployee(ctx.user.id, { ...input, email: input.email || undefined })),
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        fullName: z.string().min(1).optional(),
        role: z.string().optional(),
        baseSalary: z.string().optional(),
        admissionDate: z.string().optional(),
        pixKey: z.string().optional(),
        email: z.string().email().nullable().optional().or(z.literal("")),
        vtDaily: z.string().optional(),
        vaDaily: z.string().optional(),
        notes: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, email, ...data } = input;
        return db.updateEmployee(id, ctx.user.id, { ...data, email: email === "" ? null : email });
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteEmployee(input.id, ctx.user.id)),
    sendPayslipEmails: protectedProcedure
      .input(z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ ctx, input }) => {
        const payslips = await db.getPayslipsForMonth(ctx.user.id, input.yearMonth);

        const mailgunApiKey = process.env.MAILGUN_API_KEY;
        const mailgunDomain = process.env.MAILGUN_DOMAIN;
        const mailgunFrom = process.env.MAILGUN_FROM ?? `holerites@${mailgunDomain}`;

        if (!mailgunApiKey || !mailgunDomain) {
          throw new Error("MAILGUN_API_KEY e MAILGUN_DOMAIN não configurados.");
        }

        const [year, month] = input.yearMonth.split("-");
        const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const monthLabel = `${monthNames[parseInt(month) - 1]}/${year}`;

        const results: { name: string; email: string; status: "sent" | "no_email" | "no_pdf" | "error"; error?: string }[] = [];

        for (const p of payslips) {
          if (!p.email) { results.push({ name: p.fullName, email: "", status: "no_email" }); continue; }
          if (!p.pdfUrl) { results.push({ name: p.fullName, email: p.email, status: "no_pdf" }); continue; }

          try {
            // Download PDF from storage URL
            const pdfRes = await fetch(p.pdfUrl);
            if (!pdfRes.ok) throw new Error(`Falha ao baixar PDF: ${pdfRes.status}`);
            const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

            // Build multipart form for Mailgun
            const form = new FormData();
            form.append("from", mailgunFrom);
            form.append("to", p.email);
            form.append("subject", `Holerite ${monthLabel} - ${p.fullName}`);
            form.append("text", `Olá ${p.fullName},\n\nSegue em anexo seu holerite referente ao mês de ${monthLabel}.\n\nAtenciosamente.`);
            form.append("attachment", new Blob([pdfBuffer], { type: "application/pdf" }), `holerite_${input.yearMonth}.pdf`);

            const mgRes = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
              method: "POST",
              headers: { Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString("base64")}` },
              body: form,
            });

            if (!mgRes.ok) {
              const errText = await mgRes.text();
              throw new Error(errText);
            }

            results.push({ name: p.fullName, email: p.email, status: "sent" });
          } catch (err: any) {
            results.push({ name: p.fullName, email: p.email, status: "error", error: err?.message });
          }
        }

        return results;
      }),
  }),

  // ─── Folha de Pagamento ───────────────────────────────────────────────────────
  payroll: router({
    listMonth: protectedProcedure
      .input(z.object({ yearMonth: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ ctx, input }) => db.listMonthlyPayroll(ctx.user.id, input.yearMonth)),
    updateAmounts: protectedProcedure
      .input(z.object({
        payrollId: z.number(),
        advanceAmount: z.string().optional(),
        netSalary: z.string().optional(),
        vtDaily: z.string().optional(),
        vaDaily: z.string().optional(),
        workingDays: z.number().int().min(1).max(31).optional(),
        otherBenefits: z.string().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { payrollId, ...data } = input;
        return db.updatePayrollAmounts(payrollId, data);
      }),
    markAdvancePaid: protectedProcedure
      .input(z.object({ payrollId: z.number(), paidDate: z.string() }))
      .mutation(({ ctx, input }) => db.markAdvancePaid(input.payrollId, ctx.user.id, input.paidDate)),
    markSalaryPaid: protectedProcedure
      .input(z.object({ payrollId: z.number(), paidDate: z.string() }))
      .mutation(({ ctx, input }) => db.markSalaryPaid(input.payrollId, ctx.user.id, input.paidDate)),
    unmarkAdvancePaid: protectedProcedure
      .input(z.object({ payrollId: z.number() }))
      .mutation(({ ctx, input }) => db.unmarkAdvancePaid(input.payrollId, ctx.user.id)),
    unmarkSalaryPaid: protectedProcedure
      .input(z.object({ payrollId: z.number() }))
      .mutation(({ ctx, input }) => db.unmarkSalaryPaid(input.payrollId, ctx.user.id)),
  }),

  // ─── Holerites PDF ───────────────────────────────────────────────────────────
  pendingPayrolls: router({
    list: protectedProcedure
      .query(({ ctx }) => db.listPendingPayrolls(ctx.user.id)),
    uploadPdf: protectedProcedure
      .input(z.object({
        pdfBase64: z.string(),
        fileName: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Convert PDF pages to images and extract payroll data via LLM
        const pdfBuffer = Buffer.from(input.pdfBase64, "base64");
        const results = await extractAllPayrollsFromPdf(pdfBuffer, ctx.user.id);
        return results;
      }),
    approve: protectedProcedure
      .input(z.object({
        id: z.number(),
        employeeName: z.string().optional(),
        position: z.string().optional(),
        baseSalary: z.string().optional(),
        netSalary: z.string().optional(),
        advanceAmount: z.string().optional(),
        vtDaily: z.string().optional(),
        vaDaily: z.string().optional(),
        workingDays: z.number().int().optional(),
        competenceMonth: z.number().int().optional(),
        competenceYear: z.number().int().optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...overrides } = input;
        return db.approvePendingPayroll(id, ctx.user.id, overrides);
      }),
    reject: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.rejectPendingPayroll(input.id)),
  }),

  // ─── Contas Bancárias ─────────────────────────────────────────────────────
  bankAccounts: router({
    list: protectedProcedure.query(({ ctx }) => db.listBankAccounts(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(100),
        bank: z.string().min(1).max(100),
        accountType: z.enum(["checking", "savings", "credit"]),
        profile: z.enum(["Pessoal", "Empresa"]),
        color: z.string().min(1).max(20),
      }))
      .mutation(({ ctx, input }) => db.createBankAccount(ctx.user.id, input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        bank: z.string().min(1).max(100).optional(),
        accountType: z.enum(["checking", "savings", "credit"]).optional(),
        profile: z.enum(["Pessoal", "Empresa"]).optional(),
        color: z.string().min(1).max(20).optional(),
      }))
      .mutation(({ ctx, input }) => {
        const { id, ...data } = input;
        return db.updateBankAccount(id, ctx.user.id, data);
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ ctx, input }) => db.deleteBankAccount(input.id, ctx.user.id)),
  }),

  // ─── Extrato Bancário ──────────────────────────────────────────────────────
  bankStatement: router({
    listImports: protectedProcedure.query(({ ctx }) => db.listStatementImports(ctx.user.id)),

    listRows: protectedProcedure
      .input(z.object({ importId: z.number() }))
      .query(({ ctx, input }) => db.listPendingStatementRows(ctx.user.id, input.importId)),

    upload: protectedProcedure
      .input(z.object({
        accountId: z.number(),
        fileBase64: z.string(),
        fileName: z.string(),
        fileType: z.enum(["pdf", "csv"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const fileBuffer = Buffer.from(input.fileBase64, "base64");

        // Salvar arquivo no storage
        const storageKey = `statements/${ctx.user.id}/${Date.now()}_${input.fileName}`;
        const { url: fileUrl } = await storagePut(storageKey, fileBuffer, input.fileType === "pdf" ? "application/pdf" : "text/csv");

        // Processar linhas do extrato
        let rows: { date: string; description: string; amount: string; type: "debit" | "credit" }[] = [];

        if (input.fileType === "csv") {
          // Parse CSV - suporta múltiplos formatos (PagSeguro, genérico)
          const text = fileBuffer.toString("utf-8").replace(/\r/g, "");
          const lines = text.split("\n").filter((l) => l.trim());
          if (lines.length < 2) throw new Error("CSV vazio ou sem dados.");

          // Detectar separador (ponto-e-vírgula ou vírgula)
          const sep = lines[0].includes(";") ? ";" : ",";

          // Ler cabeçalho para detectar formato
          const header = lines[0].split(sep).map((c) => c.trim().replace(/"/g, "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

          // Detectar índices das colunas pelo cabeçalho
          const findCol = (...names: string[]) => {
            for (const name of names) {
              const idx = header.findIndex((h) => h.includes(name));
              if (idx >= 0) return idx;
            }
            return -1;
          };

          const dateIdx   = findCol("DATA", "DATE", "DT");
          const descIdx   = findCol("DESCRICAO", "DESCRIPTION", "HISTORICO", "DESCRI");
          const amtIdx    = findCol("VALOR", "AMOUNT", "VALUE", "MONTANTE");
          const typeIdx   = findCol("TIPO", "TYPE");

          // Fallback: assume posições genéricas (data, desc, valor)
          const colDate = dateIdx >= 0 ? dateIdx : 0;
          const colDesc = descIdx >= 0 ? descIdx : 1;
          const colAmt  = amtIdx  >= 0 ? amtIdx  : 2;
          const colType = typeIdx >= 0 ? typeIdx : -1;

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map((c) => c.trim().replace(/"/g, ""));
            if (cols.length <= Math.max(colDate, colDesc, colAmt)) continue;

            const rawDate = cols[colDate];
            const rawDesc = cols[colDesc];
            const tipoRaw = colType >= 0 ? cols[colType] : "";
            // Combinar TIPO + DESCRICAO para dar contexto completo à IA
            const description = tipoRaw && rawDesc ? `${tipoRaw} - ${rawDesc}` : (rawDesc || tipoRaw);
            let amountStr = cols[colAmt];

            // Remover espaços e normalizar número BR (1.234,56 → 1234.56)
            amountStr = amountStr.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || !rawDate || !description) continue;

            // Converter data DD/MM/YYYY → YYYY-MM-DD
            let dateFormatted = rawDate;
            if (rawDate.includes("/")) {
              const parts = rawDate.split("/");
              if (parts.length === 3) {
                dateFormatted = parts[2].length === 4
                  ? `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`
                  : `${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
              }
            }

            // Determinar tipo: usa coluna TIPO se existir (PagSeguro), senão pelo sinal do valor
            let type: "debit" | "credit";
            if (colType >= 0 && cols[colType]) {
              const tipoVal = cols[colType].toLowerCase();
              type = (tipoVal.includes("receb") || tipoVal.includes("credit") || tipoVal.includes("venda") || tipoVal.includes("resgate") || tipoVal.includes("rendimento") || tipoVal.includes("desbloqueado") || tipoVal.includes("estorno pix") || tipoVal.includes("renda fixa"))
                ? "credit" : "debit";
              // Se valor é negativo, sempre debit
              if (amount < 0) type = "debit";
              if (amount > 0 && type === "debit" && !tipoVal.includes("cancelamento") && !tipoVal.includes("ajuste") && !tipoVal.includes("bloqueio")) type = "credit";
            } else {
              type = amount < 0 ? "debit" : "credit";
            }

            rows.push({
              date: dateFormatted,
              description,
              amount: Math.abs(amount).toFixed(2),
              type,
            });
          }
        } else {
          // PDF: converte para imagem e usa IA para extrair linhas
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stmt-"));
          const pdfPath = path.join(tmpDir, "stmt.pdf");
          fs.writeFileSync(pdfPath, fileBuffer);
          const imgBase = path.join(tmpDir, "page");
          try {
            execSync(`pdftoppm -r 150 -png "${pdfPath}" "${imgBase}"`, { timeout: 60000 });
          } catch {}
          const pageFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".png")).sort();
          const allText: string[] = [];
          for (const pageFile of pageFiles) {
            const imgBuf = fs.readFileSync(path.join(tmpDir, pageFile));
            const { url: imgUrl } = await storagePut(`statements/pages/${Date.now()}_${pageFile}`, imgBuf, "image/png");
            const messages: Message[] = [{
              role: "user",
              content: [
                { type: "image_url", image_url: { url: imgUrl } },
                { type: "text", text: `Extraia todas as transações deste extrato bancário brasileiro.
Retorne um array JSON com objetos: { date: "YYYY-MM-DD", description: string, amount: number (sempre positivo), type: "debit"|"credit" }
Débitos (saídas, pagamentos, compras) = "debit". Créditos (entradas, depósitos, pix recebido) = "credit".
Retorne SOMENTE o array JSON, sem texto extra.` },
              ],
            }];
            try {
              const result = await invokeLLM({ messages, response_format: { type: "json_object" } });
              const parsed = JSON.parse(result);
              const arr = Array.isArray(parsed) ? parsed : parsed.transactions ?? parsed.rows ?? [];
              allText.push(JSON.stringify(arr));
            } catch {}
          }
          // Merge todas as páginas
          for (const t of allText) {
            try {
              const arr = JSON.parse(t);
              if (Array.isArray(arr)) {
                rows.push(...arr.map((r: any) => ({
                  date: r.date,
                  description: r.description,
                  amount: Math.abs(parseFloat(r.amount)).toFixed(2),
                  type: r.type as "debit" | "credit",
                })).filter((r) => r.date && r.description && !isNaN(parseFloat(r.amount))));
              }
            } catch {}
          }
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }

        if (rows.length === 0) {
          throw new Error("Nenhuma transação encontrada no arquivo. Verifique o formato.");
        }

        // Buscar categorias e conta selecionada para contexto da IA
        const userCategories = await db.getUserCategories(ctx.user.id);
        const allAccounts = await db.listBankAccounts(ctx.user.id);
        const selectedAcc = allAccounts.find((a: any) => a.id === input.accountId);
        const accountProfile = selectedAcc?.profile ?? "Pessoal";
        const empresaCategories = userCategories.filter((c: any) => !c.profile || c.profile === "Empresa").map((c: any) => c.name).join(", ");
        const pessoalCategories = userCategories.filter((c: any) => !c.profile || c.profile === "Pessoal").map((c: any) => c.name).join(", ");

        // IA categoriza cada linha em batch
        const batchSize = 20;
        const enrichedRows: any[] = [];
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const prompt = `Você é um assistente financeiro brasileiro. Categorize estas transações bancárias.

A descrição de cada transação está no formato "TIPO - NOME", onde TIPO vem do extrato bancário (ex: "Pix enviado", "Pagamento de conta", "Vendas", "Pix recebido").

Regras de categorização:

TIPO de transação → como interpretar:
- "Pix enviado - [nome]" ou "Pagamento de conta - [nome]": pagamento para fornecedor, prestador ou pessoa
- "Pix recebido - [nome]": recebimento de cliente ou pessoa
- "Vendas - Disponivel CREDITO [bandeira]": receita de vendas no cartão (crédito da máquina)
- "Transferência Enviada - [nome]": transferência bancária enviada
- "Cancelamento de venda": estorno/chargeback de venda
- "Ajuste financeiro": taxas e ajustes da operadora
- "Renda Fixa - Resgate": resgate de investimento
- "Rendimento da conta": rendimento de saldo

Regras para profile:
- "Empresa": fornecedores (tecidos, embalagens, botões, etc.), serviços empresariais, CNPJ, impostos (Simples Nacional, DARF), salários (Pix para pessoas físicas em massa no dia 05), aluguel, frete/Correios, contabilidade, software/SaaS
- "Pessoal": restaurante, farmácia, lazer, streaming, vestuário pessoal, saúde pessoal, academia
- Em caso de dúvida, use o perfil da conta: "${accountProfile}"

Categorias Empresa disponíveis: ${empresaCategories || "Fornecedores, Folha de Pagamento, Impostos, Aluguel, Frete, Serviços, Marketing, Outros"}
Categorias Pessoal disponíveis: ${pessoalCategories || "Alimentação, Transporte, Saúde, Lazer, Outros"}

Para cada transação, retorne:
- category: categoria mais adequada (use as categorias disponíveis acima)
- profile: "Pessoal" ou "Empresa"
- description: descrição curta e legível em português, sem o prefixo do tipo (ex: "L&F Boutique", "Tecelagem Chuahy - Tecidos", "Salário Funcionários", "Simples Nacional", "Excim - Importados")
- confidence: 0.0 a 1.0 (use 0.9+ quando o nome é um fornecedor/empresa reconhecível, 0.5 quando é nome de pessoa física sem contexto)

Transações:
${JSON.stringify(batch)}

Retorne SOMENTE um array JSON com os mesmos índices, sem texto extra.`;

          try {
            const messages: Message[] = [{ role: "user", content: prompt }];
            const result = await invokeLLM({ messages, response_format: { type: "json_object" } });
            const parsed = JSON.parse(result);
            const arr = Array.isArray(parsed) ? parsed : parsed.rows ?? parsed.transactions ?? [];
            for (let j = 0; j < batch.length; j++) {
              enrichedRows.push({
                ...batch[j],
                suggestedCategory: arr[j]?.category ?? "Outros",
                suggestedProfile: arr[j]?.profile ?? "Pessoal",
                suggestedDescription: arr[j]?.description ?? batch[j].description,
                confidence: String(arr[j]?.confidence ?? 0.5),
              });
            }
          } catch {
            // Se IA falhar, usa os dados brutos
            batch.forEach((r) => enrichedRows.push({ ...r, suggestedCategory: "Outros", suggestedProfile: "Pessoal", suggestedDescription: r.description, confidence: "0.3" }));
          }
        }

        // Salvar no banco
        const importId = await db.createStatementImport(ctx.user.id, {
          accountId: input.accountId,
          fileName: input.fileName,
          fileUrl,
          totalRows: enrichedRows.length,
        });
        await db.insertStatementRows(ctx.user.id, importId, input.accountId, enrichedRows);

        return { importId, total: enrichedRows.length };
      }),

    approveRow: protectedProcedure
      .input(z.object({
        rowId: z.number(),
        description: z.string(),
        category: z.string(),
        profile: z.enum(["Pessoal", "Empresa"]),
        date: z.string(),
        amount: z.string(),
      }))
      .mutation(({ ctx, input }) => {
        const { rowId, ...data } = input;
        return db.approveStatementRow(rowId, ctx.user.id, data);
      }),

    ignoreRow: protectedProcedure
      .input(z.object({ rowId: z.number() }))
      .mutation(({ ctx, input }) => db.ignoreStatementRow(input.rowId, ctx.user.id)),

    approveAll: protectedProcedure
      .input(z.object({ importId: z.number() }))
      .mutation(({ ctx, input }) => db.approveAllStatementRows(input.importId, ctx.user.id)),
  }),

});
export type AppRouter = typeof appRouter;;

