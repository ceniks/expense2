/**
 * Script de correção: sincroniza suggestedCategory, suggestedProfile e suggestedDescription
 * dos statement_rows aprovados com os dados reais do payment vinculado.
 *
 * Executar: npx tsx scripts/fix-approved-categories.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, isNotNull, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";

const { statementRows, payments } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const connection = await mysql.createConnection(url);
  const db = drizzle(connection, { schema, mode: "default" });

  // Busca todos os rows aprovados que têm um paymentId vinculado
  const approvedRows = await db
    .select()
    .from(statementRows)
    .where(and(eq(statementRows.status, "approved"), isNotNull(statementRows.paymentId)));

  console.log(`Encontrados ${approvedRows.length} lançamentos aprovados para verificar.`);

  let updated = 0;
  let skipped = 0;

  for (const row of approvedRows) {
    if (!row.paymentId) { skipped++; continue; }

    const paymentResult = await db
      .select()
      .from(payments)
      .where(eq(payments.id, row.paymentId))
      .limit(1);

    if (paymentResult.length === 0) { skipped++; continue; }

    const payment = paymentResult[0];

    // Só atualiza se houver divergência
    if (
      row.suggestedCategory === payment.category &&
      row.suggestedProfile === payment.profile &&
      row.suggestedDescription === payment.description
    ) {
      skipped++;
      continue;
    }

    await db
      .update(statementRows)
      .set({
        suggestedCategory: payment.category,
        suggestedProfile: payment.profile,
        suggestedDescription: payment.description,
      })
      .where(eq(statementRows.id, row.id));

    console.log(`  ✓ Row ${row.id}: "${row.suggestedCategory}" → "${payment.category}" (${payment.profile})`);
    updated++;
  }

  console.log(`\nConcluído: ${updated} corrigidos, ${skipped} sem alteração.`);
  await connection.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
