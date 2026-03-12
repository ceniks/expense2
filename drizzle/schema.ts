import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  passwordHash: varchar("passwordHash", { length: 255 }),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Shared groups: allow multiple users to share the same payments and categories.
 * Each user always belongs to exactly one group (their own solo group by default).
 */
export const sharedGroups = mysqlTable("shared_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().default("Meu Grupo"),
  inviteCode: varchar("inviteCode", { length: 16 }).notNull().unique(),
  createdByUserId: int("createdByUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SharedGroup = typeof sharedGroups.$inferSelect;
export type InsertSharedGroup = typeof sharedGroups.$inferInsert;

/**
 * Members of each shared group.
 */
export const groupMembers = mysqlTable("group_members", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userId: int("userId").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = typeof groupMembers.$inferInsert;

/**
 * Custom categories per group
 */
export const categories = mysqlTable("categories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),  // null = legacy (user-only), set = shared group
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Empresa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;

/**
 * Payment records per group (or user for legacy)
 */
export const payments = mysqlTable("payments", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),  // null = legacy (user-only), set = shared group
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  category: varchar("category", { length: 100 }).notNull().default("Outros"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Pessoal"),
  imageUrl: text("imageUrl"),   // S3 URL of the receipt image
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

/**
 * Invoices (Notas Fiscais) — documents with multiple installment boletos
 */
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  supplierName: varchar("supplierName", { length: 300 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
  issueDate: varchar("issueDate", { length: 10 }).notNull(), // YYYY-MM-DD
  description: text("description"),
  imageUrl: text("imageUrl"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Empresa"),
  category: varchar("category", { length: 100 }).notNull().default("Outros"),
  totalInstallments: int("totalInstallments").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

/**
 * Individual installment boletos for each invoice
 */
export const invoiceInstallments = mysqlTable("invoice_installments", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  installmentNumber: int("installmentNumber").notNull(), // 1-based
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: varchar("dueDate", { length: 10 }).notNull(), // YYYY-MM-DD
  paidAt: timestamp("paidAt"),   // null = pending, set = paid
  paymentId: int("paymentId"),   // FK to payments table when marked as paid
  alreadyPaid: tinyint("alreadyPaid").notNull().default(0), // 1 = was paid before registration (no payment record)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InvoiceInstallment = typeof invoiceInstallments.$inferSelect;
export type InsertInvoiceInstallment = typeof invoiceInstallments.$inferInsert;

/**
 * Financiamentos — empréstimos e financiamentos com até 240 parcelas mensais
 */
export const financings = mysqlTable("financings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  name: varchar("name", { length: 300 }).notNull(),              // Ex: "Financiamento Carro"
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(), // Valor total financiado
  installmentAmount: decimal("installmentAmount", { precision: 12, scale: 2 }).notNull(), // Valor de cada parcela
  totalInstallments: int("totalInstallments").notNull(),          // Total de parcelas (1-240)
  paidInstallments: int("paidInstallments").notNull().default(0), // Quantas já foram pagas
  startDate: varchar("startDate", { length: 10 }).notNull(),      // YYYY-MM-DD — data da 1ª parcela
  dueDay: int("dueDay").notNull(),                                // Dia do mês do vencimento (1-31)
  category: varchar("category", { length: 100 }).notNull().default("Financiamento"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Pessoal"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Financing = typeof financings.$inferSelect;
export type InsertFinancing = typeof financings.$inferInsert;

/**
 * Contas Mensais — contas fixas pagas todo mês (luz, água, condomínio, cartões, etc.)
 */
export const monthlyBills = mysqlTable("monthly_bills", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  name: varchar("name", { length: 300 }).notNull(),              // Ex: "Conta de Luz"
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // Valor mensal
  dueDay: int("dueDay").notNull(),                               // Dia do mês do vencimento (1-31)
  category: varchar("category", { length: 100 }).notNull().default("Contas"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Pessoal"),
  isActive: boolean("isActive").notNull().default(true),         // Ativa ou arquivada
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type MonthlyBill = typeof monthlyBills.$inferSelect;
export type InsertMonthlyBill = typeof monthlyBills.$inferInsert;

/**
 * Pagamentos de contas mensais — registro de cada mês pago
 */
export const monthlyBillPayments = mysqlTable("monthly_bill_payments", {
  id: int("id").autoincrement().primaryKey(),
  billId: int("billId").notNull(),
  userId: int("userId").notNull(),
  yearMonth: varchar("yearMonth", { length: 7 }).notNull(),       // YYYY-MM — mês de referência
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // Valor pago (pode diferir do padrão)
  paidAt: timestamp("paidAt").defaultNow().notNull(),
  paymentId: int("paymentId"),                                   // FK para payments quando registrado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MonthlyBillPayment = typeof monthlyBillPayments.$inferSelect;
export type InsertMonthlyBillPayment = typeof monthlyBillPayments.$inferInsert;

/**
 * Notas Fiscais recebidas por e-mail aguardando revisão do usuário
 */
export const pendingInvoices = mysqlTable("pending_invoices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  // Dados extraídos pela IA
  supplierName: varchar("supplierName", { length: 300 }),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  issueDate: varchar("issueDate", { length: 10 }),
  description: text("description"),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 100 }).notNull().default("Outros"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Empresa"),
  installmentsJson: text("installmentsJson"), // JSON array de parcelas
  // Origem do e-mail
  fromEmail: varchar("fromEmail", { length: 320 }),
  emailSubject: varchar("emailSubject", { length: 500 }),
  // Status
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PendingInvoice = typeof pendingInvoices.$inferSelect;
export type InsertPendingInvoice = typeof pendingInvoices.$inferInsert;


// ─── Funcionários ─────────────────────────────────────────────────────────────

/**
 * Cadastro de funcionários
 */
export const employees = mysqlTable("employees", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  fullName: varchar("fullName", { length: 300 }).notNull(),
  role: varchar("role", { length: 100 }).notNull().default(""),
  baseSalary: decimal("baseSalary", { precision: 12, scale: 2 }).notNull().default("0"),
  admissionDate: varchar("admissionDate", { length: 10 }).notNull().default(""),
  pixKey: varchar("pixKey", { length: 300 }).notNull().default(""),
  email: varchar("email", { length: 300 }),
  vtDaily: decimal("vtDaily", { precision: 8, scale: 2 }).notNull().default("0"),
  vaDaily: decimal("vaDaily", { precision: 8, scale: 2 }).notNull().default("0"),
  isActive: boolean("isActive").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Employee = typeof employees.$inferSelect;
export type InsertEmployee = typeof employees.$inferInsert;

/**
 * Folha de pagamento mensal por funcionário
 * Pagamento dia 05: salário líquido + VT + VA + outros benefícios
 * Adiantamento dia 20: valor único
 */
export const employeePayments = mysqlTable("employee_payments", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employeeId").notNull(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  yearMonth: varchar("yearMonth", { length: 7 }).notNull(),             // YYYY-MM
  // Adiantamento (dia 20)
  advanceAmount: decimal("advanceAmount", { precision: 12, scale: 2 }).notNull().default("0"),
  advancePaidAt: timestamp("advancePaidAt"),
  advancePaymentId: int("advancePaymentId"),
  // Salário dia 05
  netSalary: decimal("netSalary", { precision: 12, scale: 2 }).notNull().default("0"),
  vtDaily: decimal("vtDaily", { precision: 8, scale: 2 }).notNull().default("0"),
  vaDaily: decimal("vaDaily", { precision: 8, scale: 2 }).notNull().default("0"),
  workingDays: int("workingDays").notNull().default(22),
  otherBenefits: decimal("otherBenefits", { precision: 12, scale: 2 }).notNull().default("0"),
  salaryPaidAt: timestamp("salaryPaidAt"),
  salaryPaymentId: int("salaryPaymentId"),
  // Origem do holerite (PDF)
  pdfUrl: varchar("pdfUrl", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmployeePayment = typeof employeePayments.$inferSelect;
export type InsertEmployeePayment = typeof employeePayments.$inferInsert;

/**
 * Holerites recebidos via upload aguardando revisão
 */
export const pendingPayrolls = mysqlTable("pending_payrolls", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  employeeId: int("employeeId"),                                        // null = funcionário novo
  employeeName: varchar("employeeName", { length: 300 }).notNull(),
  position: varchar("position", { length: 100 }),
  baseSalary: decimal("baseSalary", { precision: 12, scale: 2 }),
  netSalary: decimal("netSalary", { precision: 12, scale: 2 }),
  advanceAmount: decimal("advanceAmount", { precision: 12, scale: 2 }),
  vtDaily: decimal("vtDaily", { precision: 8, scale: 2 }),
  competenceMonth: int("competenceMonth"),
  competenceYear: int("competenceYear"),
  rawData: json("rawData"),
  pdfUrl: varchar("pdfUrl", { length: 500 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PendingPayroll = typeof pendingPayrolls.$inferSelect;
export type InsertPendingPayroll = typeof pendingPayrolls.$inferInsert;

// ─── Contas Bancárias ─────────────────────────────────────────────────────────

export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  name: varchar("name", { length: 100 }).notNull(),       // "Nubank Pessoal"
  bank: varchar("bank", { length: 100 }).notNull(),        // "Nubank"
  accountType: mysqlEnum("accountType", ["checking", "savings", "credit"]).notNull().default("checking"),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull().default("Pessoal"),
  color: varchar("color", { length: 20 }).notNull().default("#6366f1"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BankAccount = typeof bankAccounts.$inferSelect;
export type InsertBankAccount = typeof bankAccounts.$inferInsert;

// ─── Importações de Extrato ───────────────────────────────────────────────────

export const bankStatementImports = mysqlTable("bank_statement_imports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  accountId: int("accountId").notNull(),
  fileName: varchar("fileName", { length: 300 }).notNull(),
  importedAt: timestamp("importedAt").defaultNow().notNull(),
  totalRows: int("totalRows").notNull().default(0),
  imported: int("imported").notNull().default(0),
  ignored: int("ignored").notNull().default(0),
  fileUrl: text("fileUrl"),
});

export type BankStatementImport = typeof bankStatementImports.$inferSelect;
export type InsertBankStatementImport = typeof bankStatementImports.$inferInsert;

// ─── Linhas do Extrato ────────────────────────────────────────────────────────

export const statementRows = mysqlTable("statement_rows", {
  id: int("id").autoincrement().primaryKey(),
  importId: int("importId").notNull(),
  accountId: int("accountId").notNull(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  date: varchar("date", { length: 10 }).notNull(),          // YYYY-MM-DD
  description: varchar("description", { length: 500 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // negativo=débito, positivo=crédito
  type: mysqlEnum("type", ["debit", "credit"]).notNull(),
  // Sugestão da IA
  suggestedCategory: varchar("suggestedCategory", { length: 100 }),
  suggestedProfile: mysqlEnum("suggestedProfile", ["Pessoal", "Empresa"]),
  suggestedDescription: varchar("suggestedDescription", { length: 500 }),
  confidence: decimal("confidence", { precision: 3, scale: 2 }),  // 0.00 a 1.00
  // Decisão do usuário
  status: mysqlEnum("status", ["pending", "approved", "ignored"]).notNull().default("pending"),
  isTransfer: boolean("isTransfer").notNull().default(false), // detectado como transferência entre contas
  transferPairId: int("transferPairId"),  // id da linha par (outra conta)
  paymentId: int("paymentId"),   // preenchido quando aprovado
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type StatementRow = typeof statementRows.$inferSelect;
export type InsertStatementRow = typeof statementRows.$inferInsert;

/**
 * Regras aprendidas de categorização de extrato
 */
export const statementRules = mysqlTable("statement_rules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  groupId: int("groupId"),
  pattern: varchar("pattern", { length: 300 }).notNull(), // nome normalizado (lowercase, sem tipo)
  category: varchar("category", { length: 100 }).notNull(),
  profile: mysqlEnum("profile", ["Pessoal", "Empresa"]).notNull(),
  suggestedDescription: varchar("suggestedDescription", { length: 500 }),
  usageCount: int("usageCount").notNull().default(1),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
