/**
 * Script de correção: recalcula todos os pagamentos de salário já realizados
 * usando VT/VA do cadastro do funcionário (não do registro da folha).
 *
 * Executar: npx tsx scripts/fix-salary-payments.ts
 */

import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, isNotNull, and } from "drizzle-orm";
import * as schema from "../drizzle/schema";

const { employees, employeePayments, payments } = schema;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");

  const connection = await mysql.createConnection(url);
  const db = drizzle(connection, { schema, mode: "default" });

  // Busca todos os registros de folha que tiveram salário pago
  const paidPayrolls = await db
    .select()
    .from(employeePayments)
    .where(and(isNotNull(employeePayments.salaryPaymentId), isNotNull(employeePayments.salaryPaidAt)));

  console.log(`Encontrados ${paidPayrolls.length} pagamentos de salário para corrigir.`);

  let updated = 0;
  let skipped = 0;

  for (const payroll of paidPayrolls) {
    if (!payroll.salaryPaymentId || !payroll.employeeId) {
      skipped++;
      continue;
    }

    // Busca cadastro do funcionário para pegar VT/VA corretos
    const empRows = await db
      .select()
      .from(employees)
      .where(eq(employees.id, payroll.employeeId))
      .limit(1);

    if (empRows.length === 0) {
      console.log(`  PULANDO: funcionário ${payroll.employeeId} não encontrado`);
      skipped++;
      continue;
    }

    const emp = empRows[0];

    // Recalcula com VT/VA do cadastro
    const vtDaily = emp.vtDaily ?? "0";
    const vaDaily = emp.vaDaily ?? "0";
    const vtTotal = (parseFloat(vtDaily) * payroll.workingDays).toFixed(2);
    const vaTotal = (parseFloat(vaDaily) * payroll.workingDays).toFixed(2);
    const totalSalary = (
      parseFloat(payroll.netSalary) +
      parseFloat(vtTotal) +
      parseFloat(vaTotal) +
      parseFloat(payroll.otherBenefits)
    ).toFixed(2);

    const notes = `Funcionário: ${emp.fullName} | Líquido: R$ ${payroll.netSalary} | VT: R$ ${vtTotal} (R$ ${vtDaily}/dia × ${payroll.workingDays}d) | VA: R$ ${vaTotal} (R$ ${vaDaily}/dia × ${payroll.workingDays}d) | Outros: R$ ${payroll.otherBenefits} | Chave PIX: ${emp.pixKey}`;

    // Atualiza o lançamento no Início
    await db
      .update(payments)
      .set({ amount: totalSalary, notes })
      .where(eq(payments.id, payroll.salaryPaymentId));

    console.log(`  ✓ ${emp.fullName} (${payroll.yearMonth}): R$ ${totalSalary} (VT: ${vtTotal} + VA: ${vaTotal})`);
    updated++;
  }

  console.log(`\nConcluído: ${updated} atualizados, ${skipped} pulados.`);
  await connection.end();
}

main().catch((err) => {
  console.error("Erro:", err);
  process.exit(1);
});
