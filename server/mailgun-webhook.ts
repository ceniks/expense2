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
import { getDb, getAISettings } from "./db";
import { pendingInvoices, users, groupMembers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";
import type { AIConfig } from "./ai-provider";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const NF_SYSTEM_PROMPT = `Você é um assistente especializado em extrair informações de Notas Fiscais Eletrônicas (NF-e/DANFE) brasileiras.
Analise a nota fiscal com atenção especial à seção de DUPLICATAS/COBRANÇA.

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
1. SEMPRE extraia as duplicatas reais da seção DUPLICATAS/COBRANÇA se ela existir.
2. NÃO invente parcelas nem calcule com base no valor total.
3. Se não houver seção de duplicatas, retorne installments como array vazio [].
4. Datas no formato brasileiro (DD/MM/AAAA) devem ser convertidas para YYYY-MM-DD.
5. Valores com vírgula como separador decimal (ex: R$ 13.776,25) devem ser convertidos para decimal (13776.25).

Se não conseguir extrair algum campo, retorne null para ele.`;

/** Call Claude API with PDF document support */
async function callClaudeWithPDF(apiKey: string, pdfBase64: string): Promise<string> {
  const model = "claude-sonnet-4-6";
  const body = {
    model,
    max_tokens: 4096,
    system: NF_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: "Extraia as informações desta Nota Fiscal e retorne apenas o JSON." },
        ],
      },
    ],
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const data = await response.json() as any;
  const text: string = data.content?.[0]?.text ?? "{}";
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

/** Extract NF data from a PDF buffer using the user's configured AI */
async function extractInvoiceDataFromPdf(pdfBuffer: Buffer, aiConfig: AIConfig): Promise<{
  imageUrl: string;
  supplierName: string | null;
  totalAmount: number | null;
  issueDate: string | null;
  description: string | null;
  category: string;
  installments: { number: number; amount: number; dueDate: string }[];
}> {
  const fileName = `invoices/email/${Date.now()}.pdf`;
  const { url: imageUrl } = await storagePut(fileName, pdfBuffer, "application/pdf");
  const pdfBase64 = pdfBuffer.toString("base64");

  let content: string;

  if (aiConfig.provider === "claude" && aiConfig.apiKey) {
    content = await callClaudeWithPDF(aiConfig.apiKey, pdfBase64);
  } else {
    // Fallback: Manus/Gemini/GPT via invokeLLM (OpenAI-compat with image_url)
    const pdfDataUrl = `data:application/pdf;base64,${pdfBase64}`;
    const messages: Message[] = [
      { role: "system", content: NF_SYSTEM_PROMPT },
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
    content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
  }

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

/** Fallback: find the owner/first user in the system */
async function findOwnerUser(): Promise<{ id: number; groupId: number | null } | null> {
  const db = await getDb();
  if (!db) return null;
  // Try by OWNER_OPEN_ID env var first
  if (ENV.ownerOpenId) {
    const rows = await db
      .select({ id: users.id, groupId: groupMembers.groupId })
      .from(users)
      .leftJoin(groupMembers, eq(groupMembers.userId, users.id))
      .where(eq(users.openId, ENV.ownerOpenId))
      .limit(1);
    if (rows.length > 0) return { id: rows[0].id, groupId: rows[0].groupId ?? null };
  }
  // Fallback: first user created
  const rows = await db
    .select({ id: users.id, groupId: groupMembers.groupId })
    .from(users)
    .leftJoin(groupMembers, eq(groupMembers.userId, users.id))
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

      // Find the user by their email address; fallback to owner/first user
      const foundUser =
        (await findUserByEmail(originalSender)) ??
        (await findUserByEmail(sender)) ??
        (await findOwnerUser());

      if (!foundUser) {
        console.log(`[Mailgun] No user found for email: ${originalSender} or ${sender}, and no owner user found`);
        res.status(200).json({ ok: true, message: "User not found, ignoring" });
        return;
      }

      console.log(`[Mailgun] Assigning to user ${foundUser.id} (matched by email or fallback owner)`);

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

      // Get user's configured AI provider
      const aiConfig = await getAISettings(foundUser.id);

      // Process each PDF
      for (const pdfFile of pdfFiles) {
        try {
          console.log(`[Mailgun] Processing PDF: ${pdfFile.originalname} (${pdfFile.size} bytes)`);
          const extracted = await extractInvoiceDataFromPdf(pdfFile.buffer, aiConfig);

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
