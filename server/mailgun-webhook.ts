/**
 * Mailgun Inbound Email Webhook
 *
 * Recebe e-mails encaminhados para o endereço do Mailgun,
 * extrai PDFs de notas fiscais, processa com IA e salva como
 * pending_invoices aguardando revisão do usuário.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import { invokeLLM, type Message } from "./_core/llm";
import { storagePut } from "./storage";
import { getDb } from "./db";
import { pendingInvoices, users, groupMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Extract NF data from a PDF buffer using AI */
async function extractInvoiceDataFromPdf(pdfBuffer: Buffer): Promise<{
  imageUrl: string;
  supplierName: string | null;
  totalAmount: number | null;
  issueDate: string | null;
  description: string | null;
  category: string;
  installments: { number: number; amount: number; dueDate: string }[];
}> {
  // Upload PDF to S3 and send as base64 data URL to AI
  const fileName = `invoices/email/${Date.now()}.pdf`;
  const { url: imageUrl } = await storagePut(fileName, pdfBuffer, "application/pdf");
  const pdfBase64 = pdfBuffer.toString("base64");
  const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;

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
      content: [
        { type: "text", text: "Extraia as informações desta Nota Fiscal:" },
        { type: "image_url", image_url: { url: pdfDataUrl, detail: "high" } },
      ],
    },
  ];

  const response = await invokeLLM({ messages, response_format: { type: "json_object" } });
  const rawContent = response.choices[0]?.message?.content ?? "{}";
  const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(content); } catch { /* ignore */ }

  const rawInstallments = Array.isArray(data.installments) ? data.installments : [];
  const parsedInstallments = rawInstallments
    .filter((inst: any) => inst && typeof inst.amount === "number" && typeof inst.dueDate === "string")
    .map((inst: any, idx: number) => ({
      number: typeof inst.number === "number" ? inst.number : idx + 1,
      amount: inst.amount,
      dueDate: inst.dueDate,
    }))
    .slice(0, 12);

  return {
    imageUrl,
    supplierName: typeof data.supplierName === "string" ? data.supplierName : null,
    totalAmount: typeof data.totalAmount === "number" ? data.totalAmount : null,
    issueDate: typeof data.issueDate === "string" ? data.issueDate : null,
    description: typeof data.description === "string" ? data.description : null,
    category: typeof data.category === "string" ? data.category : "Outros",
    installments: parsedInstallments,
  };
}

/** Find user by email address */
async function findUserByEmail(email: string): Promise<{ id: number; groupId: number | null } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ id: users.id, groupId: groupMembers.groupId })
    .from(users)
    .leftJoin(groupMembers, eq(groupMembers.userId, users.id))
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  if (rows.length === 0) return null;
  return { id: rows[0].id, groupId: rows[0].groupId ?? null };
}

export function registerMailgunWebhook(app: Express) {
  // Mailgun sends multipart/form-data for inbound emails
  app.post("/api/mailgun/inbound", upload.any(), async (req: Request, res: Response) => {
    try {
      console.log("[Mailgun] Inbound email received");

      // Parse Mailgun fields
      const sender: string = req.body?.sender || req.body?.from || "";
      const recipient: string = req.body?.recipient || req.body?.to || "";
      const subject: string = req.body?.subject || "";

      console.log(`[Mailgun] From: ${sender} | To: ${recipient} | Subject: ${subject}`);

      // Extract the original sender from forwarded email
      // When user forwards: "From: user@gmail.com" appears in body-plain
      const bodyPlain: string = req.body?.["body-plain"] || req.body?.["stripped-text"] || "";
      let originalSender = sender;

      // Try to find "From: email@domain.com" in the forwarded body
      const fromMatch = bodyPlain.match(/From:\s*.*?<([^>]+)>|From:\s*([\w.+-]+@[\w.-]+)/i);
      if (fromMatch) {
        originalSender = (fromMatch[1] || fromMatch[2]).trim();
        console.log(`[Mailgun] Detected original sender from forwarded body: ${originalSender}`);
      }

      // Find the user by their email address
      const foundUser =
        (await findUserByEmail(originalSender)) ??
        (await findUserByEmail(sender));

      if (!foundUser) {
        console.log(`[Mailgun] No user found for email: ${originalSender} or ${sender}`);
        res.status(200).json({ ok: true, message: "User not found, ignoring" });
        return;
      }

      // Find PDF attachments
      const files = (req.files as { fieldname: string; originalname: string; mimetype: string; buffer: Buffer; size: number }[]) || [];
      const pdfFiles = files.filter(
        (f) => f.mimetype === "application/pdf" || f.originalname?.toLowerCase().endsWith(".pdf")
      );

      if (pdfFiles.length === 0) {
        console.log("[Mailgun] No PDF attachments found");
        res.status(200).json({ ok: true, message: "No PDF attachments" });
        return;
      }

      const db = await getDb();
      if (!db) {
        res.status(200).json({ ok: true, message: "DB not available" });
        return;
      }

      // Process each PDF
      for (const pdfFile of pdfFiles) {
        try {
          console.log(`[Mailgun] Processing PDF: ${pdfFile.originalname} (${pdfFile.size} bytes)`);
          const extracted = await extractInvoiceDataFromPdf(pdfFile.buffer);

          await db.insert(pendingInvoices).values({
            userId: foundUser.id,
            groupId: foundUser.groupId,
            supplierName: extracted.supplierName ?? undefined,
            totalAmount: extracted.totalAmount !== null ? String(extracted.totalAmount) : undefined,
            issueDate: extracted.issueDate ?? undefined,
            description: extracted.description ?? undefined,
            imageUrl: extracted.imageUrl,
            category: extracted.category,
            profile: "Empresa",
            installmentsJson: JSON.stringify(extracted.installments),
            fromEmail: originalSender || sender,
            emailSubject: subject.slice(0, 500),
            status: "pending",
          });

          console.log(`[Mailgun] Saved pending invoice for user ${foundUser.id}: ${extracted.supplierName}`);
        } catch (pdfErr: any) {
          console.error(`[Mailgun] Error processing PDF ${pdfFile.originalname}:`, pdfErr.message);
        }
      }

      res.status(200).json({ ok: true });
    } catch (err: any) {
      console.error("[Mailgun] Webhook error:", err.message);
      // Always return 200 to Mailgun to avoid retries
      res.status(200).json({ ok: true, error: err.message });
    }
  });
}
