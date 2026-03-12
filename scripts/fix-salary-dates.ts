/**
 * Script de correção: corrige a data de todos os pagamentos de salário já realizados
 * para o dia 05 do mês da folha correspondente.
 *
 * Executar: npx tsx scripts/fix-salary-dates.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, isNotNull, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";

const { employeePayments, payments } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const connection = await mysql.createConnection(url);
  const db = drizzle(connection, { schema, mode: "default" });

  const paidPayrolls = await db
    .select()
    .from(employeePayments)
    .where(and(isNotNull(employeePayments.salaryPaymentId), isNotNull(employeePayments.salaryPaidAt)));

  console.log(`Encontrados ${paidPayrolls.length} pagamentos de salário para corrigir.`);

  let updated = 0;
  let skipped = 0;

  for (const payroll of paidPayrolls) {
    if (!payroll.salaryPaymentId || !payroll.yearMonth) {
      skipped++;
      continue;
    }

    // Dia 05 do mês da folha
    const day05 = `${payroll.yearMonth}-05`;

    await db
      .update(payments)
      .set({ date: day05 })
      .where(eq(payments.id, payroll.salaryPaymentId));

    console.log(`  ✓ Folha ${payroll.yearMonth} → data corrigida para ${day05}`);
    updated++;
  }

  console.log(`\nConcluído: ${updated} atualizados, ${skipped} pulados.`);
  await connection.end();
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
