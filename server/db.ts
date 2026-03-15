import { and, asc, desc, eq, or, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, payments, categories, InsertPayment, InsertCategory, sharedGroups, groupMembers, InsertSharedGroup, InsertGroupMember, invoices, invoiceInstallments, financings, monthlyBills, monthlyBillPayments, employees, employeePayments, pendingPayrolls, bankAccounts, bankStatementImports, statementRows, statementRules, aiSettings } from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { AIConfig, AIProvider } from "./ai-provider";

let _db: ReturnType<typeof drizzle> | null = null;
let _migrationsRan = false;

async function runStartupMigrations(db: ReturnType<typeof drizzle>) {
  if (_migrationsRan) return;
  _migrationsRan = true;
  try {
    // Verifica se bankAccountId já existe com tipo correto
    const [rows] = await db.execute(sql`
      SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'bankAccountId'
    `) as any;
    const col = Array.isArray(rows) ? rows[0] : null;
    if (!col) {
      await db.execute(sql`ALTER TABLE payments ADD COLUMN bankAccountId INT NULL`);
      console.log("[Migration] Added bankAccountId column to payments");
    } else if (col.DATA_TYPE !== "int") {
      await db.execute(sql`ALTER TABLE payments MODIFY COLUMN bankAccountId INT NULL`);
      console.log("[Migration] Fixed bankAccountId column type in payments");
    }
  } catch (e) {
    console.warn("[Migration] bankAccountId migration failed:", e);
  }
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
      runStartupMigrations(_db);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Shared Groups ─────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Get the group that a user currently belongs to.
 * If the user has no group, create a solo group for them automatically.
 */
export async function getOrCreateUserGroup(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if user is already in a group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    const group = await db.select().from(sharedGroups).where(eq(sharedGroups.id, groupId)).limit(1);
    return group[0] ?? null;
  }

  // No group yet — create a solo group
  let inviteCode = generateInviteCode();
  // Ensure uniqueness
  while (true) {
    const existing = await db.select({ id: sharedGroups.id }).from(sharedGroups).where(eq(sharedGroups.inviteCode, inviteCode)).limit(1);
    if (existing.length === 0) break;
    inviteCode = generateInviteCode();
  }

  const result = await db.insert(sharedGroups).values({
    name: "Meu Grupo",
    inviteCode,
    createdByUserId: userId,
  });
  const groupId = result[0].insertId;

  await db.insert(groupMembers).values({ groupId, userId });

  const group = await db.select().from(sharedGroups).where(eq(sharedGroups.id, groupId)).limit(1);
  return group[0] ?? null;
}

export async function getGroupMembers(groupId: number) {
  const db = await getDb();
  if (!db) return [];

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .where(eq(groupMembers.groupId, groupId));

  return members;
}

export async function joinGroupByInviteCode(userId: number, inviteCode: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Find the group
  const group = await db.select().from(sharedGroups).where(eq(sharedGroups.inviteCode, inviteCode.toUpperCase())).limit(1);
  if (group.length === 0) throw new Error("Código de convite inválido.");

  const targetGroup = group[0];

  // Check if user is already in this group
  const existing = await db
    .select()
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, targetGroup.id), eq(groupMembers.userId, userId)))
    .limit(1);
  if (existing.length > 0) throw new Error("Você já faz parte deste grupo.");

  // Get user's current group (if any) to migrate data
  const currentMembership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  const oldGroupId = currentMembership.length > 0 ? currentMembership[0].groupId : null;

  // Migrate user's payments and categories to the new group
  if (oldGroupId !== null) {
    await db.update(payments)
      .set({ groupId: targetGroup.id })
      .where(and(eq(payments.userId, userId), eq(payments.groupId, oldGroupId)));

    await db.update(categories)
      .set({ groupId: targetGroup.id })
      .where(and(eq(categories.userId, userId), eq(categories.groupId, oldGroupId)));

    // Remove user from old group
    await db.delete(groupMembers).where(and(eq(groupMembers.groupId, oldGroupId), eq(groupMembers.userId, userId)));

    // If old group is now empty and was a solo group, delete it
    const remainingMembers = await db.select().from(groupMembers).where(eq(groupMembers.groupId, oldGroupId));
    if (remainingMembers.length === 0) {
      await db.delete(sharedGroups).where(eq(sharedGroups.id, oldGroupId));
    }
  }

  // Add user to the new group
  await db.insert(groupMembers).values({ groupId: targetGroup.id, userId });

  return targetGroup;
}

export async function leaveGroup(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get current group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length === 0) return;

  const oldGroupId = membership[0].groupId;

  // Check if this is a shared group (more than 1 member)
  const members = await db.select().from(groupMembers).where(eq(groupMembers.groupId, oldGroupId));
  if (members.length <= 1) throw new Error("Você não pode sair de um grupo individual.");

  // Create a new solo group for this user
  let inviteCode = generateInviteCode();
  while (true) {
    const existing = await db.select({ id: sharedGroups.id }).from(sharedGroups).where(eq(sharedGroups.inviteCode, inviteCode)).limit(1);
    if (existing.length === 0) break;
    inviteCode = generateInviteCode();
  }

  const result = await db.insert(sharedGroups).values({
    name: "Meu Grupo",
    inviteCode,
    createdByUserId: userId,
  });
  const newGroupId = result[0].insertId;

  // Move user's own payments and categories to the new solo group
  await db.update(payments)
    .set({ groupId: newGroupId })
    .where(and(eq(payments.userId, userId), eq(payments.groupId, oldGroupId)));

  await db.update(categories)
    .set({ groupId: newGroupId })
    .where(and(eq(categories.userId, userId), eq(categories.groupId, oldGroupId)));

  // Remove from old group and add to new solo group
  await db.delete(groupMembers).where(and(eq(groupMembers.groupId, oldGroupId), eq(groupMembers.userId, userId)));
  await db.insert(groupMembers).values({ groupId: newGroupId, userId });

  return newGroupId;
}

export async function regenerateInviteCode(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Only the group creator can regenerate
  const group = await db.select().from(sharedGroups).where(and(eq(sharedGroups.id, groupId), eq(sharedGroups.createdByUserId, userId))).limit(1);
  if (group.length === 0) throw new Error("Apenas o criador do grupo pode regenerar o código.");

  let inviteCode = generateInviteCode();
  while (true) {
    const existing = await db.select({ id: sharedGroups.id }).from(sharedGroups).where(eq(sharedGroups.inviteCode, inviteCode)).limit(1);
    if (existing.length === 0) break;
    inviteCode = generateInviteCode();
  }

  await db.update(sharedGroups).set({ inviteCode }).where(eq(sharedGroups.id, groupId));
  return inviteCode;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function getUserPayments(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get user's group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    // Return all payments for the group
    return db
      .select()
      .from(payments)
      .where(eq(payments.groupId, groupId))
      .orderBy(desc(payments.date), desc(payments.createdAt));
  }

  // Fallback: legacy payments belonging only to this user
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.date), desc(payments.createdAt));
}

export async function createPayment(data: InsertPayment & { userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Assign to user's group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, data.userId))
    .limit(1);

  const groupId = membership.length > 0 ? membership[0].groupId : null;
  const result = await db.insert(payments).values({ ...data, groupId });
  return result[0].insertId;
}

export async function updatePayment(id: number, userId: number, data: Partial<InsertPayment>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get user's group to allow editing group payments
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    await db.update(payments).set(data).where(and(eq(payments.id, id), eq(payments.groupId, groupId)));
  } else {
    await db.update(payments).set(data).where(and(eq(payments.id, id), eq(payments.userId, userId)));
  }
}

export async function deletePayment(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get user's group to allow deleting group payments
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    await db.delete(payments).where(and(eq(payments.id, id), eq(payments.groupId, groupId)));
  } else {
    await db.delete(payments).where(and(eq(payments.id, id), eq(payments.userId, userId)));
  }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getUserCategories(userId: number) {
  const db = await getDb();
  if (!db) return [];

  // Get user's group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    return db.select().from(categories).where(eq(categories.groupId, groupId)).orderBy(categories.name);
  }

  return db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.name);
}

export async function createCategory(data: InsertCategory & { userId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Assign to user's group
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, data.userId))
    .limit(1);

  const groupId = membership.length > 0 ? membership[0].groupId : null;
  const result = await db.insert(categories).values({ ...data, groupId });
  return result[0].insertId;
}

export async function updateCategory(id: number, userId: number, data: Partial<InsertCategory>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    await db.update(categories).set(data).where(and(eq(categories.id, id), eq(categories.groupId, groupId)));
  } else {
    await db.update(categories).set(data).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }
}

export async function deleteCategory(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);

  if (membership.length > 0) {
    const groupId = membership[0].groupId;
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.groupId, groupId)));
  } else {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }
}

// ─── Invoices (Notas Fiscais) ────────────────────────────────────────────────

/** Helperr: get user's current groupId */
async function getUserGroupId(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const membership = await db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .limit(1);
  return membership.length > 0 ? membership[0].groupId : null;
}

export async function getUserInvoices(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const groupId = await getUserGroupId(userId);

  const rows = groupId
    ? await db.select().from(invoices).where(eq(invoices.groupId, groupId)).orderBy(desc(invoices.createdAt))
    : await db.select().from(invoices).where(eq(invoices.userId, userId)).orderBy(desc(invoices.createdAt));

  if (rows.length === 0) return [];

  const invoiceIds = rows.map((r) => r.id);
  const installmentRows = await db
    .select()
    .from(invoiceInstallments)
    .where(inArray(invoiceInstallments.invoiceId, invoiceIds))
    .orderBy(invoiceInstallments.invoiceId, invoiceInstallments.installmentNumber);

  return rows.map((inv) => ({
    ...inv,
    installments: installmentRows.filter((i) => i.invoiceId === inv.id),
  }));
}

export async function createInvoiceWithInstallments(
  data: {
    userId: number;
    supplierName: string;
    totalAmount: string;
    issueDate: string;
    description?: string | null;
    imageUrl?: string | null;
    profile: "Pessoal" | "Empresa";
    category: string;
    installments: Array<{ installmentNumber: number; amount: string; dueDate: string }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const groupId = await getUserGroupId(data.userId);

  const result = await db.insert(invoices).values({
    userId: data.userId,
    groupId,
    supplierName: data.supplierName,
    totalAmount: data.totalAmount,
    issueDate: data.issueDate,
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? null,
    profile: data.profile,
    category: data.category,
    totalInstallments: data.installments.length,
  });

  const invoiceId = result[0].insertId;

  await db.insert(invoiceInstallments).values(
    data.installments.map((inst) => ({
      invoiceId,
      installmentNumber: inst.installmentNumber,
      amount: inst.amount,
      dueDate: inst.dueDate,
    }))
  );

  return invoiceId;
}

export async function markInstallmentPaid(
  installmentId: number,
  userId: number,
  paidDate: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get installment + invoice info
  const instRows = await db
    .select()
    .from(invoiceInstallments)
    .where(eq(invoiceInstallments.id, installmentId))
    .limit(1);
  if (instRows.length === 0) throw new Error("Parcela não encontrada.");
  const inst = instRows[0];

  const invRows = await db.select().from(invoices).where(eq(invoices.id, inst.invoiceId)).limit(1);
  if (invRows.length === 0) throw new Error("Nota fiscal não encontrada.");
  const inv = invRows[0];

  const groupId = await getUserGroupId(userId);

  // Create a payment record for this installment
  const description = `${inv.supplierName} — Parcela ${inst.installmentNumber}/${inv.totalInstallments}`;
  const payResult = await db.insert(payments).values({
    userId,
    groupId,
    description,
    amount: inst.amount,
    date: paidDate,
    category: inv.category,
    profile: inv.profile,
    imageUrl: inv.imageUrl ?? null,
    notes: `Nota Fiscal: ${inv.supplierName}`,
  });
  const paymentId = payResult[0].insertId;

  // Mark installment as paid
  await db.update(invoiceInstallments)
    .set({ paidAt: new Date(), paymentId })
    .where(eq(invoiceInstallments.id, installmentId));

  return { paymentId };
}

export async function markInstallmentUnpaid(installmentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const instRows = await db
    .select()
    .from(invoiceInstallments)
    .where(eq(invoiceInstallments.id, installmentId))
    .limit(1);
  if (instRows.length === 0) throw new Error("Parcela não encontrada.");
  const inst = instRows[0];

  // Delete the linked payment if it exists
  if (inst.paymentId) {
    await deletePayment(inst.paymentId, userId);
  }

  // Unmark installment
  await db.update(invoiceInstallments)
    .set({ paidAt: null, paymentId: null })
    .where(eq(invoiceInstallments.id, installmentId));
}

/** Mark installment as paid without creating a payment record */
export async function markInstallmentPaidNoRecord(installmentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(invoiceInstallments)
    .set({ paidAt: new Date(), paymentId: null })
    .where(and(eq(invoiceInstallments.id, installmentId)));
}

/** Mark monthly bill as paid without creating a payment record */
export async function payMonthlyBillNoRecord(userId: number, data: { id: number; yearMonth: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [bill] = await db.select().from(monthlyBills).where(eq(monthlyBills.id, data.id));
  if (!bill) throw new Error("Conta não encontrada");
  await db.insert(monthlyBillPayments).values({
    billId: data.id, userId, yearMonth: data.yearMonth,
    amount: String(bill.amount), paymentId: null,
  });
  return { success: true };
}

/** Mark one financing installment as paid (increments paidInstallments) */
export async function markFinancingInstallmentPaid(financingId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [f] = await db.select().from(financings).where(eq(financings.id, financingId));
  if (!f) throw new Error("Financiamento não encontrado");
  await db.update(financings)
    .set({ paidInstallments: f.paidInstallments + 1 })
    .where(eq(financings.id, financingId));
}

/** Mark installment as already paid (no payment record created) */
export async function markInstallmentAlreadyPaid(installmentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const instRows = await db
    .select()
    .from(invoiceInstallments)
    .where(eq(invoiceInstallments.id, installmentId))
    .limit(1);
  if (instRows.length === 0) throw new Error("Parcela não encontrada.");

  await db.update(invoiceInstallments)
    .set({ alreadyPaid: 1, paidAt: null, paymentId: null })
    .where(eq(invoiceInstallments.id, installmentId));
}

/** Unmark an installment previously marked as already paid */
export async function unmarkInstallmentAlreadyPaid(installmentId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(invoiceInstallments)
    .set({ alreadyPaid: 0 })
    .where(eq(invoiceInstallments.id, installmentId));
}

export async function deleteInvoice(invoiceId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Delete all linked payments first
  const installments = await db
    .select()
    .from(invoiceInstallments)
    .where(eq(invoiceInstallments.invoiceId, invoiceId));

  for (const inst of installments) {
    if (inst.paymentId) {
      await deletePayment(inst.paymentId, userId);
    }
  }

  // Delete installments and invoice
  await db.delete(invoiceInstallments).where(eq(invoiceInstallments.invoiceId, invoiceId));
  await db.delete(invoices).where(eq(invoices.id, invoiceId));
}

/** Return all installments for the user's group, enriched with invoice info, ordered by dueDate */
export async function getInstallmentSchedule(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const groupId = await getUserGroupId(userId);

  // Get all invoices for the group/user
  const invoiceRows = groupId
    ? await db.select().from(invoices).where(eq(invoices.groupId, groupId))
    : await db.select().from(invoices).where(eq(invoices.userId, userId));

  if (invoiceRows.length === 0) return [];

  const invoiceIds = invoiceRows.map((r) => r.id);
  const installmentRows = await db
    .select()
    .from(invoiceInstallments)
    .where(inArray(invoiceInstallments.invoiceId, invoiceIds))
    .orderBy(invoiceInstallments.dueDate, invoiceInstallments.installmentNumber);

  // Build a map for quick invoice lookup
  const invoiceMap = new Map(invoiceRows.map((inv) => [inv.id, inv]));

  return installmentRows
    .filter((inst) => !inst.alreadyPaid) // exclude installments marked as already paid before registration
    .map((inst) => {
      const inv = invoiceMap.get(inst.invoiceId)!;
      return {
        installmentId: inst.id,
        invoiceId: inst.invoiceId,
        supplierName: inv.supplierName,
        category: inv.category,
        profile: inv.profile,
        totalInstallments: inv.totalInstallments,
        installmentNumber: inst.installmentNumber,
        amount: inst.amount,
        dueDate: inst.dueDate,
        isPaid: inst.paidAt !== null,
        paidAt: inst.paidAt,
        paymentId: inst.paymentId,
      };
    });
}

/** Update invoice header fields and replace all its installments */
export async function updateInvoice(
  invoiceId: number,
  userId: number,
  data: {
    supplierName: string;
    totalAmount: string;
    issueDate: string;
    description?: string | null;
    profile: "Pessoal" | "Empresa";
    category: string;
    installments: Array<{ installmentNumber: number; amount: string; dueDate: string }>;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Update invoice header
  await db.update(invoices).set({
    supplierName: data.supplierName,
    totalAmount: data.totalAmount,
    issueDate: data.issueDate,
    description: data.description ?? null,
    profile: data.profile,
    category: data.category,
    totalInstallments: data.installments.length,
  }).where(eq(invoices.id, invoiceId));

  // Get existing installments to clean up paid payments
  const existing = await db.select().from(invoiceInstallments).where(eq(invoiceInstallments.invoiceId, invoiceId));

  // Remove linked payments for installments that are being replaced
  for (const inst of existing) {
    if (inst.paymentId) {
      await deletePayment(inst.paymentId, userId);
    }
  }

  // Delete all old installments
  await db.delete(invoiceInstallments).where(eq(invoiceInstallments.invoiceId, invoiceId));

  // Insert new installments
  await db.insert(invoiceInstallments).values(
    data.installments.map((inst) => ({
      invoiceId,
      installmentNumber: inst.installmentNumber,
      amount: inst.amount,
      dueDate: inst.dueDate,
    }))
  );
}

// ─── Financiamentos ────────────────────────────────────────────────────────────

export async function listFinancings(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const group = await getOrCreateUserGroup(userId);
  const groupId = group?.id ?? null;
  const rows = groupId
    ? await db.select().from(financings).where(eq(financings.groupId, groupId)).orderBy(financings.createdAt)
    : await db.select().from(financings).where(eq(financings.userId, userId)).orderBy(financings.createdAt);
  return rows;
}

export async function createFinancing(userId: number, data: {
  name: string; totalAmount: number; installmentAmount: number;
  totalInstallments: number; paidInstallments: number; startDate: string;
  dueDay: number; category: string; profile: "Pessoal" | "Empresa"; notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const group = await getOrCreateUserGroup(userId);
  const [result] = await db.insert(financings).values({
    userId, groupId: group?.id ?? null, name: data.name,
    totalAmount: String(data.totalAmount), installmentAmount: String(data.installmentAmount),
    totalInstallments: data.totalInstallments, paidInstallments: data.paidInstallments,
    startDate: data.startDate, dueDay: data.dueDay, category: data.category,
    profile: data.profile, notes: data.notes ?? null,
  });
  return result;
}

export async function updateFinancing(userId: number, data: {
  id: number; name?: string; totalAmount?: number; installmentAmount?: number;
  totalInstallments?: number; paidInstallments?: number; startDate?: string;
  dueDay?: number; category?: string; profile?: "Pessoal" | "Empresa"; notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, totalAmount, installmentAmount, ...rest } = data;
  await db.update(financings).set({
    ...rest,
    ...(totalAmount !== undefined ? { totalAmount: String(totalAmount) } : {}),
    ...(installmentAmount !== undefined ? { installmentAmount: String(installmentAmount) } : {}),
  }).where(eq(financings.id, id));
}

export async function registerFinancingPayment(userId: number, financingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [financing] = await db.select().from(financings).where(eq(financings.id, financingId));
  if (!financing) throw new Error("Financiamento não encontrado");
  const newPaid = Math.min(financing.paidInstallments + 1, financing.totalInstallments);
  await db.update(financings).set({ paidInstallments: newPaid }).where(eq(financings.id, financingId));
  const today = new Date().toISOString().slice(0, 10);
  await createPayment({
    userId,
    description: `${financing.name} — parcela ${newPaid}/${financing.totalInstallments}`,
    amount: financing.installmentAmount,
    date: today,
    category: financing.category,
    profile: financing.profile,
    imageUrl: null,
    notes: null,
  });
  return { paidInstallments: newPaid };
}

export async function deleteFinancing(userId: number, financingId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(financings).where(eq(financings.id, financingId));
}

// ─── Contas Mensais ────────────────────────────────────────────────────────────

export async function listMonthlyBills(userId: number, targetYearMonth?: string) {
  const db = await getDb();
  if (!db) return [];
  const group = await getOrCreateUserGroup(userId);
  const groupId = group?.id ?? null;
  const bills = groupId
    ? await db.select().from(monthlyBills).where(and(eq(monthlyBills.groupId, groupId), eq(monthlyBills.isActive, true))).orderBy(monthlyBills.dueDay)
    : await db.select().from(monthlyBills).where(and(eq(monthlyBills.userId, userId), eq(monthlyBills.isActive, true))).orderBy(monthlyBills.dueDay);
  const now = new Date();
  const yearMonth = targetYearMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const billIds = bills.map((b) => b.id);
  let paymentsThisMonth: Array<{ billId: number; yearMonth: string; amount: string }> = [];
  if (billIds.length > 0) {
    paymentsThisMonth = await db
      .select({ billId: monthlyBillPayments.billId, yearMonth: monthlyBillPayments.yearMonth, amount: monthlyBillPayments.amount })
      .from(monthlyBillPayments).where(inArray(monthlyBillPayments.billId, billIds));
  }
  const paidMap = new Map(paymentsThisMonth.map((p) => [`${p.billId}:${p.yearMonth}`, p.amount]));
  return bills.map((b) => ({
    ...b,
    paidThisMonth: paidMap.has(`${b.id}:${yearMonth}`),
    paidAmountThisMonth: paidMap.get(`${b.id}:${yearMonth}`) ?? null,
  }));
}

export async function createMonthlyBill(userId: number, data: {
  name: string; amount: number; dueDay: number;
  category: string; profile: "Pessoal" | "Empresa"; notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const group = await getOrCreateUserGroup(userId);
  const [result] = await db.insert(monthlyBills).values({
    userId, groupId: group?.id ?? null, name: data.name,
    amount: String(data.amount), dueDay: data.dueDay, category: data.category,
    profile: data.profile, notes: data.notes ?? null,
  });
  return result;
}

export async function updateMonthlyBill(userId: number, data: {
  id: number; name?: string; amount?: number; dueDay?: number;
  category?: string; profile?: "Pessoal" | "Empresa"; isActive?: boolean; notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { id, amount, ...rest } = data;
  await db.update(monthlyBills).set({
    ...rest,
    ...(amount !== undefined ? { amount: String(amount) } : {}),
  }).where(eq(monthlyBills.id, id));
}

export async function payMonthlyBill(userId: number, data: { id: number; amount?: number; yearMonth: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [bill] = await db.select().from(monthlyBills).where(eq(monthlyBills.id, data.id));
  if (!bill) throw new Error("Conta não encontrada");
  const paidAmount = data.amount ?? Number(bill.amount);
  const [year, month] = data.yearMonth.split("-");
  const dueDate = `${year}-${month}-${String(bill.dueDay).padStart(2, "0")}`;
  const paymentId = await createPayment({
    userId, description: bill.name, amount: String(paidAmount),
    date: dueDate, category: bill.category, profile: bill.profile, imageUrl: null, notes: null,
  });
  await db.insert(monthlyBillPayments).values({
    billId: data.id, userId, yearMonth: data.yearMonth,
    amount: String(paidAmount), paymentId: typeof paymentId === "number" ? paymentId : null,
  });
  return { success: true };
}

export async function unpayMonthlyBill(userId: number, billId: number, yearMonth: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(monthlyBillPayments).where(
    and(eq(monthlyBillPayments.billId, billId), eq(monthlyBillPayments.yearMonth, yearMonth))
  );
}

export async function deleteMonthlyBill(userId: number, billId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(monthlyBillPayments).where(eq(monthlyBillPayments.billId, billId));
  await db.delete(monthlyBills).where(eq(monthlyBills.id, billId));
}

// ─── Agenda Unificada ──────────────────────────────────────────────────────────

export type UnifiedScheduleItem = {
  id: string;                    // unique key: "invoice-{id}", "financing-{id}", "bill-{id}-{yearMonth}"
  type: "invoice" | "financing" | "bill";
  name: string;                  // supplier / financing name / bill name
  category: string;
  profile: string;
  amount: string;                // decimal string
  dueDate: string;               // YYYY-MM-DD
  isPaid: boolean;
  // invoice-specific
  installmentId?: number;
  invoiceId?: number;
  installmentNumber?: number;
  totalInstallments?: number;
  paymentId?: number | null;
  paidAt?: Date | null;
  // financing-specific
  financingId?: number;
  financingInstallmentNumber?: number;
  financingTotalInstallments?: number;
  // bill-specific
  billId?: number;
  yearMonth?: string;
};

export async function getUnifiedSchedule(userId: number, targetYearMonth?: string): Promise<UnifiedScheduleItem[]> {
  const db = await getDb();
  if (!db) return [];

  const groupId = await getUserGroupId(userId);
  const result: UnifiedScheduleItem[] = [];

  // ── 1. Notas Fiscais (installments) ──────────────────────────────────────────
  const invoiceRows = groupId
    ? await db.select().from(invoices).where(eq(invoices.groupId, groupId))
    : await db.select().from(invoices).where(eq(invoices.userId, userId));

  if (invoiceRows.length > 0) {
    const invoiceIds = invoiceRows.map((r) => r.id);
    const installmentRows = await db
      .select()
      .from(invoiceInstallments)
      .where(inArray(invoiceInstallments.invoiceId, invoiceIds))
      .orderBy(invoiceInstallments.dueDate, invoiceInstallments.installmentNumber);

    const invoiceMap = new Map(invoiceRows.map((inv) => [inv.id, inv]));
    for (const inst of installmentRows) {
      // Skip installments marked as "already paid before registration" — they have no payment record
      if (inst.alreadyPaid) continue;
      const inv = invoiceMap.get(inst.invoiceId)!;
      result.push({
        id: `invoice-${inst.id}`,
        type: "invoice",
        name: inv.supplierName,
        category: inv.category,
        profile: inv.profile,
        amount: inst.amount,
        dueDate: inst.dueDate,
        isPaid: inst.paidAt !== null,
        installmentId: inst.id,
        invoiceId: inst.invoiceId,
        installmentNumber: inst.installmentNumber,
        totalInstallments: inv.totalInstallments,
        paymentId: inst.paymentId,
        paidAt: inst.paidAt,
      });
    }
  }

  // ── 2. Financiamentos ─────────────────────────────────────────────────────────
  const financingRows = groupId
    ? await db.select().from(financings).where(eq(financings.groupId, groupId)).orderBy(financings.createdAt)
    : await db.select().from(financings).where(eq(financings.userId, userId)).orderBy(financings.createdAt);

  // Fuso horário São Paulo
  const nowBR = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const getBRPart = (type: string) => parseInt(nowBR.find((p) => p.type === type)?.value ?? "0");
  const nowYear = getBRPart("year");
  const nowMonth = getBRPart("month");
  const nowDay = getBRPart("day");

  for (const f of financingRows) {
    const totalInst = f.totalInstallments;
    const paidInst = f.paidInstallments;
    const remaining = totalInst - paidInst;
    if (remaining <= 0) continue; // fully paid

    // A próxima parcela (paidInst + 1) vence no mês atual no dueDay.
    // Se o dueDay já passou neste mês, a próxima parcela é no próximo mês.
    const dueDay = f.dueDay;
    let nextYear = nowYear;
    let nextMonth = nowMonth;
    if (nowDay > dueDay) {
      // Dia de vencimento já passou — próxima parcela é no próximo mês
      nextMonth += 1;
      if (nextMonth > 12) { nextMonth = 1; nextYear++; }
    }

    if (targetYearMonth) {
      // Mostrar apenas a parcela do mês solicitado
      const [ty, tm] = targetYearMonth.split("-").map(Number);
      // Calcular qual parcela cai neste mês
      // A parcela (paidInst+1) vence em nextYear/nextMonth, então offset = monthsDiff desde lá
      const instOffset = (ty - nextYear) * 12 + (tm - nextMonth);
      if (instOffset >= 0 && instOffset < remaining) {
        const instNum = paidInst + 1 + instOffset;
        const actualDueDay = Math.min(dueDay, new Date(ty, tm, 0).getDate());
        const dueDate = `${ty}-${String(tm).padStart(2, "0")}-${String(actualDueDay).padStart(2, "0")}`;
        result.push({
          id: `financing-${f.id}-${instNum}`,
          type: "financing",
          name: f.name,
          category: f.category,
          profile: f.profile,
          amount: f.installmentAmount,
          dueDate,
          isPaid: false,
          financingId: f.id,
          financingInstallmentNumber: instNum,
          financingTotalInstallments: totalInst,
        });
      }
    } else {
      // Gerar as parcelas restantes a partir da próxima (mês atual + próximos 12)
      for (let offset = 0; offset < remaining; offset++) {
        const instNum = paidInst + 1 + offset;
        let instYear = nextYear;
        let instMonth = nextMonth + offset;
        while (instMonth > 12) { instMonth -= 12; instYear++; }

        const actualDueDay = Math.min(dueDay, new Date(instYear, instMonth, 0).getDate());
        const dueDate = `${instYear}-${String(instMonth).padStart(2, "0")}-${String(actualDueDay).padStart(2, "0")}`;

        const monthsDiff = (instYear - nowYear) * 12 + (instMonth - nowMonth);
        if (monthsDiff > 12) break;

        result.push({
          id: `financing-${f.id}-${instNum}`,
          type: "financing",
          name: f.name,
          category: f.category,
          profile: f.profile,
          amount: f.installmentAmount,
          dueDate,
          isPaid: false,
          financingId: f.id,
          financingInstallmentNumber: instNum,
          financingTotalInstallments: totalInst,
        });
      }
    }
  }

  // ── 3. Contas Mensais ─────────────────────────────────────────────────────────
  const billRows = groupId
    ? await db.select().from(monthlyBills).where(and(eq(monthlyBills.groupId, groupId), eq(monthlyBills.isActive, true))).orderBy(monthlyBills.dueDay)
    : await db.select().from(monthlyBills).where(and(eq(monthlyBills.userId, userId), eq(monthlyBills.isActive, true))).orderBy(monthlyBills.dueDay);

  if (billRows.length > 0) {
    const billIds = billRows.map((b) => b.id);
    // Get payments for the last 2 months + next month
    const allPayments = await db
      .select()
      .from(monthlyBillPayments)
      .where(inArray(monthlyBillPayments.billId, billIds));

    const paidSet = new Set(allPayments.map((p) => `${p.billId}:${p.yearMonth}`));

    // Show target month (if provided) or current + next 3 months
    const monthsToShow: Array<{ year: number; month: number }> = [];
    if (targetYearMonth) {
      const [ty, tm] = targetYearMonth.split("-").map(Number);
      monthsToShow.push({ year: ty, month: tm });
    } else {
      monthsToShow.push({ year: nowYear, month: nowMonth });
      for (let offset = 1; offset <= 3; offset++) {
        let m = nowMonth + offset;
        let y = nowYear;
        while (m > 12) { m -= 12; y++; }
        monthsToShow.push({ year: y, month: m });
      }
    }

    for (const bill of billRows) {
      for (const { year, month } of monthsToShow) {
        const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
        const isPaid = paidSet.has(`${bill.id}:${yearMonth}`);

        const dueDay = Math.min(bill.dueDay, new Date(year, month, 0).getDate());
        const dueDate = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;

        result.push({
          id: `bill-${bill.id}-${yearMonth}`,
          type: "bill",
          name: bill.name,
          category: bill.category,
          profile: bill.profile,
          amount: bill.amount,
          dueDate,
          isPaid,
          billId: bill.id,
          yearMonth,
        });
      }
    }
  }

  // Sort by dueDate ascending
  result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return result;
}


// ─── Funcionários ─────────────────────────────────────────────────────────────

export async function listEmployees(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);
  const rows = groupId
    ? await db.select().from(employees).where(and(eq(employees.groupId, groupId), eq(employees.isActive, true))).orderBy(asc(employees.fullName))
    : await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.isActive, true))).orderBy(asc(employees.fullName));
  return rows;
}

export async function createEmployee(userId: number, data: {
  fullName: string;
  role: string;
  baseSalary: string;
  admissionDate: string;
  pixKey: string;
  email?: string;
  vtDaily?: string;
  vaDaily?: string;
  notes?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  const result = await db.insert(employees).values({
    userId,
    groupId,
    fullName: data.fullName,
    role: data.role,
    baseSalary: data.baseSalary,
    admissionDate: data.admissionDate,
    pixKey: data.pixKey,
    email: data.email ?? null,
    vtDaily: data.vtDaily ?? "0",
    vaDaily: data.vaDaily ?? "0",
    notes: data.notes ?? null,
  });
  return { id: result[0].insertId };
}

export async function updateEmployee(employeeId: number, userId: number, data: {
  fullName?: string;
  role?: string;
  baseSalary?: string;
  admissionDate?: string;
  pixKey?: string;
  email?: string | null;
  vtDaily?: string;
  vaDaily?: string;
  notes?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ ...data }).where(eq(employees.id, employeeId));
}

export async function deleteEmployee(employeeId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employees).set({ isActive: false }).where(eq(employees.id, employeeId));
}

// ─── Folha de Pagamento ────────────────────────────────────────────────────────

/** Get or create the monthly payroll record for a given employee + yearMonth */
export async function getOrCreateMonthlyPayroll(employeeId: number, userId: number, yearMonth: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await db.select().from(employeePayments)
    .where(and(eq(employeePayments.employeeId, employeeId), eq(employeePayments.yearMonth, yearMonth)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const groupId = await getUserGroupId(userId);
  // Fetch employee defaults for VT/VA
  const empRows = await db.select({ vtDaily: employees.vtDaily, vaDaily: employees.vaDaily })
    .from(employees).where(eq(employees.id, employeeId)).limit(1);
  const empData = empRows.length > 0 ? empRows[0] : null;
  const result = await db.insert(employeePayments).values({
    employeeId,
    userId,
    groupId,
    yearMonth,
    advanceAmount: "0",
    netSalary: "0",
    vtDaily: empData?.vtDaily ?? "0",
    vaDaily: empData?.vaDaily ?? "0",
    workingDays: 22,
    otherBenefits: "0",
  });
  const rows = await db.select().from(employeePayments).where(eq(employeePayments.id, result[0].insertId)).limit(1);
  return rows[0];
}

/** List all payroll records for a given yearMonth for the user's group */
export async function listMonthlyPayroll(userId: number, yearMonth: string) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);

  const empRows = groupId
    ? await db.select().from(employees).where(and(eq(employees.groupId, groupId), eq(employees.isActive, true))).orderBy(asc(employees.fullName))
    : await db.select().from(employees).where(and(eq(employees.userId, userId), eq(employees.isActive, true))).orderBy(asc(employees.fullName));

  if (empRows.length === 0) return [];

  const results = [];
  for (const emp of empRows) {
    const payroll = await getOrCreateMonthlyPayroll(emp.id, userId, yearMonth);
    // Always use VA/VT from employee registration, not from the stored payroll record
    results.push({ employee: emp, payroll: { ...payroll, vtDaily: emp.vtDaily, vaDaily: emp.vaDaily } });
  }
  return results;
}

/** Update payroll amounts */
export async function updatePayrollAmounts(payrollId: number, data: {
  advanceAmount?: string;
  netSalary?: string;
  vtDaily?: string;
  vaDaily?: string;
  workingDays?: number;
  otherBenefits?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(employeePayments).set({ ...data }).where(eq(employeePayments.id, payrollId));
}

/** Mark advance as paid — creates a payment record */
export async function markAdvancePaid(payrollId: number, userId: number, paidDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(employeePayments).where(eq(employeePayments.id, payrollId)).limit(1);
  if (rows.length === 0) throw new Error("Folha não encontrada.");
  const payroll = rows[0];

  const empRows = await db.select().from(employees).where(eq(employees.id, payroll.employeeId)).limit(1);
  if (empRows.length === 0) throw new Error("Funcionário não encontrado.");
  const emp = empRows[0];

  const groupId = await getUserGroupId(userId);
  const description = `Adiantamento — ${emp.fullName} (${payroll.yearMonth})`;
  const payResult = await db.insert(payments).values({
    userId,
    groupId,
    description,
    amount: payroll.advanceAmount,
    date: paidDate,
    category: "Salários",
    profile: "Empresa",
    notes: `Funcionário: ${emp.fullName} | Chave PIX: ${emp.pixKey}`,
  });
  const paymentId = payResult[0].insertId;
  await db.update(employeePayments).set({ advancePaidAt: new Date(), advancePaymentId: paymentId }).where(eq(employeePayments.id, payrollId));
  return { paymentId };
}

/** Mark salary as paid — creates a payment record */
export async function markSalaryPaid(payrollId: number, userId: number, paidDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(employeePayments).where(eq(employeePayments.id, payrollId)).limit(1);
  if (rows.length === 0) throw new Error("Folha não encontrada.");
  const payroll = rows[0];

  const empRows = await db.select().from(employees).where(eq(employees.id, payroll.employeeId)).limit(1);
  if (empRows.length === 0) throw new Error("Funcionário não encontrado.");
  const emp = empRows[0];

  const groupId = await getUserGroupId(userId);
  // Always use VT/VA from employee registration, not from stored payroll record
  const vtDaily = emp.vtDaily ?? payroll.vtDaily ?? "0";
  const vaDaily = emp.vaDaily ?? payroll.vaDaily ?? "0";
  const vtTotal = (parseFloat(vtDaily) * payroll.workingDays).toFixed(2);
  const vaTotal = (parseFloat(vaDaily) * payroll.workingDays).toFixed(2);
  const totalSalary = (
    parseFloat(payroll.netSalary) +
    parseFloat(vtTotal) +
    parseFloat(vaTotal) +
    parseFloat(payroll.otherBenefits)
  ).toFixed(2);

  const description = `Salário — ${emp.fullName} (${payroll.yearMonth})`;
  const payResult = await db.insert(payments).values({
    userId,
    groupId,
    description,
    amount: totalSalary,
    date: paidDate,
    category: "Salários",
    profile: "Empresa",
    notes: `Funcionário: ${emp.fullName} | Líquido: R$ ${payroll.netSalary} | VT: R$ ${vtTotal} (R$ ${vtDaily}/dia × ${payroll.workingDays}d) | VA: R$ ${vaTotal} (R$ ${vaDaily}/dia × ${payroll.workingDays}d) | Outros: R$ ${payroll.otherBenefits} | Chave PIX: ${emp.pixKey}`,
  });
  const paymentId = payResult[0].insertId;
  await db.update(employeePayments).set({ salaryPaidAt: new Date(), salaryPaymentId: paymentId }).where(eq(employeePayments.id, payrollId));
  return { paymentId };
}

/** Unmark advance payment */
export async function unmarkAdvancePaid(payrollId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(employeePayments).where(eq(employeePayments.id, payrollId)).limit(1);
  if (rows.length === 0) return;
  const payroll = rows[0];
  if (payroll.advancePaymentId) await deletePayment(payroll.advancePaymentId, userId);
  await db.update(employeePayments).set({ advancePaidAt: null, advancePaymentId: null }).where(eq(employeePayments.id, payrollId));
}

/** Unmark salary payment */
export async function unmarkSalaryPaid(payrollId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(employeePayments).where(eq(employeePayments.id, payrollId)).limit(1);
  if (rows.length === 0) return;
  const payroll = rows[0];
  if (payroll.salaryPaymentId) await deletePayment(payroll.salaryPaymentId, userId);
  await db.update(employeePayments).set({ salaryPaidAt: null, salaryPaymentId: null }).where(eq(employeePayments.id, payrollId));
}

// ─── Pending Payrolls (holerites PDF) ─────────────────────────────────────────

export async function listPendingPayrolls(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);
  if (!groupId) return [];
  return db.select().from(pendingPayrolls)
    .where(and(eq(pendingPayrolls.groupId, groupId), eq(pendingPayrolls.status, "pending")))
    .orderBy(asc(pendingPayrolls.employeeName));
}

export async function createPendingPayroll(userId: number, data: {
  employeeName: string;
  position?: string;
  baseSalary?: string;
  netSalary?: string;
  advanceAmount?: string;
  vtDaily?: string;
  competenceMonth?: number;
  competenceYear?: number;
  rawData?: any;
  pdfUrl?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  if (!groupId) throw new Error("Grupo não encontrado");

  // Check if employee already exists in the group
  const existing = await db.select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.groupId, groupId), eq(employees.fullName, data.employeeName), eq(employees.isActive, true)))
    .limit(1);

  const result = await db.insert(pendingPayrolls).values({
    groupId,
    employeeId: existing.length > 0 ? existing[0].id : null,
    employeeName: data.employeeName,
    position: data.position ?? null,
    baseSalary: data.baseSalary ?? null,
    netSalary: data.netSalary ?? null,
    advanceAmount: data.advanceAmount ?? null,
    vtDaily: data.vtDaily ?? null,
    competenceMonth: data.competenceMonth ?? null,
    competenceYear: data.competenceYear ?? null,
    rawData: data.rawData ?? null,
    pdfUrl: data.pdfUrl ?? null,
  });
  return { id: result[0].insertId, employeeExists: existing.length > 0 };
}

/**
 * Smart upsert when uploading a PDF:
 * - Employee exists + payroll exists for that month → auto-update (skip pending review)
 * - Employee has a pending payroll → replace it with new data
 * - Otherwise → create new pending payroll
 */
export async function upsertPayrollFromPdf(
  userId: number,
  data: {
    employeeName: string;
    position?: string;
    baseSalary?: string;
    netSalary?: string;
    advanceAmount?: string;
    vtDaily?: string;
    competenceMonth?: number;
    competenceYear?: number;
    rawData?: any;
    pdfUrl?: string;
  }
): Promise<"auto_updated" | "pending_updated" | "pending_created"> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  if (!groupId) throw new Error("Grupo não encontrado");

  const compMonth = data.competenceMonth ?? new Date().getMonth() + 1;
  const compYear = data.competenceYear ?? new Date().getFullYear();
  const paymentMonth = compMonth === 12 ? 1 : compMonth + 1;
  const paymentYear = compMonth === 12 ? compYear + 1 : compYear;
  const yearMonth = `${paymentYear}-${String(paymentMonth).padStart(2, "0")}`;

  // Find employee by name in the group
  const empRows = await db.select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.groupId, groupId), eq(employees.fullName, data.employeeName)))
    .limit(1);

  if (empRows.length > 0) {
    const employeeId = empRows[0].id;
    const payrollRows = await db.select().from(employeePayments)
      .where(and(eq(employeePayments.employeeId, employeeId), eq(employeePayments.yearMonth, yearMonth)))
      .limit(1);

    if (payrollRows.length > 0) {
      // Auto-update existing approved payroll (advanceAmount is always manual — never overwritten)
      const updateData: Record<string, any> = { netSalary: data.netSalary ?? null };
      if (data.pdfUrl) updateData.pdfUrl = data.pdfUrl; // only overwrite if valid
      await db.update(employeePayments).set(updateData).where(eq(employeePayments.id, payrollRows[0].id));

      // Only remove stale pending payrolls if pdfUrl was successfully extracted
      if (data.pdfUrl) {
        await db.delete(pendingPayrolls).where(
          and(
            eq(pendingPayrolls.groupId, groupId),
            eq(pendingPayrolls.employeeName, data.employeeName),
            eq(pendingPayrolls.status, "pending")
          )
        );
      }
      return "auto_updated";
    }
  }

  // Check for existing pending payroll for this employee
  const existingPending = await db.select({ id: pendingPayrolls.id })
    .from(pendingPayrolls)
    .where(and(
      eq(pendingPayrolls.groupId, groupId),
      eq(pendingPayrolls.employeeName, data.employeeName),
      eq(pendingPayrolls.status, "pending")
    ))
    .limit(1);

  const pendingValues: Record<string, any> = {
    employeeId: empRows.length > 0 ? empRows[0].id : null,
    position: data.position ?? null,
    baseSalary: data.baseSalary ?? null,
    netSalary: data.netSalary ?? null,
    advanceAmount: data.advanceAmount ?? null,
    vtDaily: data.vtDaily ?? null,
    competenceMonth: data.competenceMonth ?? null,
    competenceYear: data.competenceYear ?? null,
    rawData: data.rawData ?? null,
  };
  if (data.pdfUrl) pendingValues.pdfUrl = data.pdfUrl; // only overwrite pdfUrl if valid

  if (existingPending.length > 0) {
    await db.update(pendingPayrolls).set(pendingValues).where(eq(pendingPayrolls.id, existingPending[0].id));
    return "pending_updated";
  }

  await db.insert(pendingPayrolls).values({
    groupId,
    employeeName: data.employeeName,
    ...pendingValues,
  });
  return "pending_created";
}

export async function approvePendingPayroll(
  payrollId: number,
  userId: number,
  overrides: {
    employeeName?: string;
    position?: string;
    baseSalary?: string;
    netSalary?: string;
    advanceAmount?: string;
    vtDaily?: string;
    vaDaily?: string;
    workingDays?: number;
    competenceMonth?: number;
    competenceYear?: number;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(pendingPayrolls).where(eq(pendingPayrolls.id, payrollId)).limit(1);
  if (rows.length === 0) throw new Error("Holerite não encontrado");
  const pending = rows[0];

  const groupId = await getUserGroupId(userId);
  if (!groupId) throw new Error("Grupo não encontrado");

  const employeeName = overrides.employeeName ?? pending.employeeName;
  const position = overrides.position ?? pending.position ?? "";
  const baseSalary = overrides.baseSalary ?? pending.baseSalary ?? "0";
  const netSalary = overrides.netSalary ?? pending.netSalary ?? "0";
  // advanceAmount is always manual — never taken from the holerite
  const vtDaily = overrides.vtDaily ?? pending.vtDaily ?? "0";
  const vaDaily = overrides.vaDaily ?? "0";
  const workingDays = overrides.workingDays ?? 22;
  const competenceMonth = overrides.competenceMonth ?? pending.competenceMonth ?? new Date().getMonth() + 1;
  const competenceYear = overrides.competenceYear ?? pending.competenceYear ?? new Date().getFullYear();
  // O holerite do mês N é pago no mês N+1
  const paymentMonth = competenceMonth === 12 ? 1 : competenceMonth + 1;
  const paymentYear = competenceMonth === 12 ? competenceYear + 1 : competenceYear;
  const yearMonth = `${paymentYear}-${String(paymentMonth).padStart(2, "0")}`;

  // Find or create employee
  let employeeId = pending.employeeId;
  if (!employeeId) {
    const existing = await db.select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.groupId, groupId), eq(employees.fullName, employeeName)))
      .limit(1);

    if (existing.length > 0) {
      employeeId = existing[0].id;
    } else {
      const empResult = await db.insert(employees).values({
        userId,
        groupId,
        fullName: employeeName,
        role: position,
        baseSalary,
        admissionDate: "",
        pixKey: "",
      });
      employeeId = empResult[0].insertId;
    }
  } else {
    // Update existing employee's role and salary if changed
    await db.update(employees).set({ role: position, baseSalary }).where(eq(employees.id, employeeId));
  }

  // Get or create payroll record for this month
  const existingPayroll = await db.select().from(employeePayments)
    .where(and(eq(employeePayments.employeeId, employeeId), eq(employeePayments.yearMonth, yearMonth)))
    .limit(1);

  if (existingPayroll.length > 0) {
    // Keep existing advanceAmount — it's always manually entered
    await db.update(employeePayments).set({
      netSalary,
      vtDaily,
      vaDaily,
      workingDays,
      pdfUrl: pending.pdfUrl ?? null,
    }).where(eq(employeePayments.id, existingPayroll[0].id));
  } else {
    await db.insert(employeePayments).values({
      employeeId,
      userId,
      groupId,
      yearMonth,
      advanceAmount: "0",  // always starts as 0 — user fills manually
      netSalary,
      vtDaily,
      vaDaily,
      workingDays,
      otherBenefits: "0",
      pdfUrl: pending.pdfUrl ?? null,
    });
  }

  await db.update(pendingPayrolls).set({ status: "approved", employeeId }).where(eq(pendingPayrolls.id, payrollId));
  return { employeeId };
}

export async function rejectPendingPayroll(payrollId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(pendingPayrolls).set({ status: "rejected" }).where(eq(pendingPayrolls.id, payrollId));
}

// ─── Contas Bancárias ─────────────────────────────────────────────────────────

export async function listBankAccounts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);
  if (groupId) {
    return db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.groupId, groupId), eq(bankAccounts.isActive, true)))
      .orderBy(asc(bankAccounts.name));
  }
  return db.select().from(bankAccounts)
    .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isActive, true)))
    .orderBy(asc(bankAccounts.name));
}

export async function createBankAccount(userId: number, data: {
  name: string;
  bank: string;
  accountType: "checking" | "savings" | "credit";
  profile: "Pessoal" | "Empresa";
  color: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  const result = await db.insert(bankAccounts).values({ ...data, userId, groupId });
  return result[0].insertId;
}

export async function updateBankAccount(id: number, userId: number, data: {
  name?: string;
  bank?: string;
  accountType?: "checking" | "savings" | "credit";
  profile?: "Pessoal" | "Empresa";
  color?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  if (groupId) {
    await db.update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.groupId, groupId)));
  } else {
    await db.update(bankAccounts).set(data).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
  }
}

export async function deleteBankAccount(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  if (groupId) {
    await db.update(bankAccounts).set({ isActive: false }).where(and(eq(bankAccounts.id, id), eq(bankAccounts.groupId, groupId)));
  } else {
    await db.update(bankAccounts).set({ isActive: false }).where(and(eq(bankAccounts.id, id), eq(bankAccounts.userId, userId)));
  }
}

export async function saveBankAccountCsvFormat(id: number, csvFormat: object) {
  const db = await getDb();
  if (!db) return;
  await db.update(bankAccounts).set({ csvFormat: JSON.stringify(csvFormat) }).where(eq(bankAccounts.id, id));
}

export async function getBankAccountCsvFormat(id: number): Promise<object | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ csvFormat: bankAccounts.csvFormat }).from(bankAccounts).where(eq(bankAccounts.id, id)).limit(1);
  if (!rows[0]?.csvFormat) return null;
  try { return JSON.parse(rows[0].csvFormat); } catch { return null; }
}

// ─── Importação de Extrato ────────────────────────────────────────────────────

export async function createStatementImport(userId: number, data: {
  accountId: number;
  fileName: string;
  fileUrl?: string;
  totalRows: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  const result = await db.insert(bankStatementImports).values({ ...data, userId, groupId });
  return result[0].insertId;
}

/** Returns the max imported date per account for the user (used to show "updated until" indicator) */
export async function getAccountMaxDates(userId: number): Promise<{ accountId: number; maxDate: string }[]> {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);
  const rows = await db
    .select({
      accountId: statementRows.accountId,
      maxDate: sql<string>`MAX(${statementRows.date})`,
    })
    .from(statementRows)
    .where(groupId ? eq(statementRows.groupId, groupId) : eq(statementRows.userId, userId))
    .groupBy(statementRows.accountId);
  return rows.map((r) => ({ accountId: r.accountId, maxDate: r.maxDate }));
}

export async function listStatementImports(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);

  const imports = groupId
    ? await db.select().from(bankStatementImports)
        .where(eq(bankStatementImports.groupId, groupId))
        .orderBy(desc(bankStatementImports.importedAt))
    : await db.select().from(bankStatementImports)
        .where(eq(bankStatementImports.userId, userId))
        .orderBy(desc(bankStatementImports.importedAt));

  if (imports.length === 0) return [];

  const importIds = imports.map((i) => i.id);
  const dateRanges = await db
    .select({
      importId: statementRows.importId,
      minDate: sql<string>`MIN(${statementRows.date})`,
      maxDate: sql<string>`MAX(${statementRows.date})`,
    })
    .from(statementRows)
    .where(inArray(statementRows.importId, importIds))
    .groupBy(statementRows.importId);

  const dateMap = new Map(dateRanges.map((r) => [r.importId, { minDate: r.minDate, maxDate: r.maxDate }]));

  return imports.map((imp) => ({
    ...imp,
    minDate: dateMap.get(imp.id)?.minDate ?? null,
    maxDate: dateMap.get(imp.id)?.maxDate ?? null,
  }));
}

export async function insertStatementRows(userId: number, importId: number, accountId: number, rows: {
  date: string;
  description: string;
  amount: string;
  type: "debit" | "credit";
  suggestedCategory?: string;
  suggestedProfile?: "Pessoal" | "Empresa";
  suggestedDescription?: string;
  confidence?: string;
}[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);
  if (rows.length === 0) return;

  // Passo 1: inserir tudo como pending para poder fazer detecção de transferências
  await db.insert(statementRows).values(
    rows.map((r) => ({ ...r, userId, groupId, importId, accountId, status: "pending" as const }))
  );

  // Passo 2: detectar transferências — mesmo usuário, mesma data, mesmo valor, tipos opostos, contas diferentes
  // Busca as linhas recém inseridas + todas as outras pendentes do usuário (outras contas/imports)
  const inserted = await db.select()
    .from(statementRows)
    .where(and(eq(statementRows.userId, userId), eq(statementRows.importId, importId)));

  const otherRows = await db.select()
    .from(statementRows)
    .where(and(eq(statementRows.userId, userId), eq(statementRows.status, "pending")));

  for (const row of inserted) {
    if (row.isTransfer) continue;
    const oppositeType = row.type === "debit" ? "credit" : "debit";
    const pair = otherRows.find(
      (r) =>
        r.id !== row.id &&
        r.accountId !== row.accountId &&
        r.date === row.date &&
        r.amount === row.amount &&
        r.type === oppositeType &&
        !r.isTransfer
    );
    if (pair) {
      await db.update(statementRows).set({ isTransfer: true, transferPairId: pair.id }).where(eq(statementRows.id, row.id));
      await db.update(statementRows).set({ isTransfer: true, transferPairId: row.id }).where(eq(statementRows.id, pair.id));
    }
  }

  // Passo 3: ignorar automaticamente créditos (não rastreamos receita aqui) e débitos de transferência
  // Créditos que são transferência: ambos os lados ignorados (movimento interno entre contas)
  // Créditos que NÃO são transferência: ignorados (sem rastreamento de receita)
  // Débitos que são transferência: ignorados (saída de uma conta entrou em outra — não é despesa)
  await db.update(statementRows)
    .set({ status: "ignored" })
    .where(and(
      eq(statementRows.importId, importId),
      eq(statementRows.userId, userId),
      or(eq(statementRows.type, "credit"), eq(statementRows.isTransfer, true)),
    ));
}

export async function listPendingStatementRows(userId: number, importId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(statementRows)
    .where(and(eq(statementRows.importId, importId), eq(statementRows.userId, userId)))
    .orderBy(asc(statementRows.date));
}

export async function bulkRevertStatementRows(rowIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  for (const rowId of rowIds) {
    const rows = await db.select().from(statementRows)
      .where(and(eq(statementRows.id, rowId), eq(statementRows.userId, userId)))
      .limit(1);
    if (rows.length === 0) continue;
    const row = rows[0];
    if (row.paymentId) {
      await db.delete(payments).where(and(eq(payments.id, row.paymentId), eq(payments.userId, userId)));
    }
    await db.update(statementRows).set({ status: "pending", paymentId: null }).where(eq(statementRows.id, rowId));
  }
}

export async function revertStatementRow(rowId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select().from(statementRows)
    .where(and(eq(statementRows.id, rowId), eq(statementRows.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new Error("Lançamento não encontrado");

  const row = rows[0];
  if (row.paymentId) {
    await db.delete(payments).where(and(eq(payments.id, row.paymentId), eq(payments.userId, userId)));
  }
  await db.update(statementRows).set({ status: "pending", paymentId: null }).where(eq(statementRows.id, rowId));
}

export async function approveStatementRow(rowId: number, userId: number, data: {
  description: string;
  category: string;
  profile: "Pessoal" | "Empresa";
  date: string;
  amount: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);

  // Busca accountId da linha para vincular ao pagamento
  const rowInfo = await db.select({ importId: statementRows.importId, accountId: statementRows.accountId })
    .from(statementRows).where(eq(statementRows.id, rowId)).limit(1);

  const payResult = await db.insert(payments).values({
    userId,
    groupId,
    description: data.description,
    amount: data.amount,
    date: data.date,
    category: data.category,
    profile: data.profile,
    bankAccountId: rowInfo[0]?.accountId ?? null,
  });
  const paymentId = payResult[0].insertId;
  await db.update(statementRows).set({
    status: "approved",
    paymentId,
    suggestedCategory: data.category,
    suggestedProfile: data.profile,
    suggestedDescription: data.description,
  }).where(eq(statementRows.id, rowId));

  // Atualiza contador no import
  if (rowInfo.length > 0) {
    await db.update(bankStatementImports)
      .set({ imported: sql`${bankStatementImports.imported} + 1` })
      .where(eq(bankStatementImports.id, rowInfo[0].importId));
  }
  return paymentId;
}

export async function ignoreStatementRow(rowId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(statementRows).set({ status: "ignored" }).where(and(eq(statementRows.id, rowId), eq(statementRows.userId, userId)));
}

export async function deleteAllPendingRows(importId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(statementRows)
    .where(and(eq(statementRows.importId, importId), eq(statementRows.userId, userId), eq(statementRows.status, "pending")));
}

export async function bulkApproveStatementRows(
  rowIds: number[], userId: number, category: string, profile: "Pessoal" | "Empresa", importId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);

  const learnedPatterns = new Map<string, string>(); // pattern → suggestedDescription

  for (const rowId of rowIds) {
    const rows = await db.select().from(statementRows)
      .where(and(eq(statementRows.id, rowId), eq(statementRows.userId, userId), eq(statementRows.status, "pending")))
      .limit(1);
    if (rows.length === 0) continue;
    const row = rows[0];
    const description = row.suggestedDescription ?? row.description;
    const payResult = await db.insert(payments).values({
      userId, groupId, description, amount: row.amount, date: row.date, category, profile, bankAccountId: row.accountId ?? null,
    });
    await db.update(statementRows).set({
      status: "approved",
      paymentId: payResult[0].insertId,
      suggestedCategory: category,
      suggestedProfile: profile,
      suggestedDescription: description,
    }).where(eq(statementRows.id, rowId));

    // Aprende o padrão
    const pattern = normalizePattern(row.description);
    await upsertStatementRule(userId, { pattern, category, profile, suggestedDescription: description });
    learnedPatterns.set(pattern, description);
  }

  // Propaga para pendentes com mesmo padrão (uma vez por padrão)
  if (importId) {
    for (const [pattern, description] of learnedPatterns) {
      await propagateCategoryToSiblings(userId, importId, pattern, category, profile, description);
    }
  }

  return rowIds.length;
}

export async function approveAllStatementRows(importId: number, userId: number, minConfidence = 0.8) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);

  const allPending = await db.select().from(statementRows)
    .where(and(eq(statementRows.importId, importId), eq(statementRows.userId, userId), eq(statementRows.status, "pending")));

  // Filtra apenas os que atingem a confiança mínima
  const pending = allPending.filter(r => parseFloat(r.confidence ?? "0") >= minConfidence);

  let count = 0;
  for (const row of pending) {
    const payResult = await db.insert(payments).values({
      userId,
      groupId,
      description: row.suggestedDescription ?? row.description,
      amount: row.amount,
      date: row.date,
      category: row.suggestedCategory ?? "Outros",
      profile: row.suggestedProfile ?? "Pessoal",
      bankAccountId: row.accountId ?? null,
    });
    await db.update(statementRows).set({ status: "approved", paymentId: payResult[0].insertId }).where(eq(statementRows.id, row.id));
    count++;
  }
  await db.update(bankStatementImports).set({ imported: count }).where(eq(bankStatementImports.id, importId));
  return count;
}

/** Backfill: preenche bankAccountId em pagamentos antigos já aprovados via extrato */
export async function backfillPaymentBankAccounts(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const groupId = await getUserGroupId(userId);

  // Busca pagamentos sem bankAccountId que têm uma statementRow vinculada
  const orphans = groupId
    ? await db.select({ paymentId: statementRows.paymentId, accountId: statementRows.accountId })
        .from(statementRows)
        .innerJoin(payments, eq(statementRows.paymentId, payments.id))
        .where(and(eq(statementRows.groupId, groupId), eq(statementRows.status, "approved"), sql`${payments.bankAccountId} IS NULL`))
    : await db.select({ paymentId: statementRows.paymentId, accountId: statementRows.accountId })
        .from(statementRows)
        .innerJoin(payments, eq(statementRows.paymentId, payments.id))
        .where(and(eq(statementRows.userId, userId), eq(statementRows.status, "approved"), sql`${payments.bankAccountId} IS NULL`));

  for (const { paymentId, accountId } of orphans) {
    if (paymentId && accountId) {
      await db.update(payments).set({ bankAccountId: accountId }).where(eq(payments.id, paymentId));
    }
  }
  return orphans.length;
}

/** Relatório por conta bancária: total de débitos por conta no período */
export async function getPaymentsByBankAccount(userId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);

  const conditions = [groupId ? eq(payments.groupId, groupId) : eq(payments.userId, userId)];
  if (startDate) conditions.push(sql`${payments.date} >= ${startDate}`);
  if (endDate) conditions.push(sql`${payments.date} <= ${endDate}`);

  const rows = await db.select({
    bankAccountId: payments.bankAccountId,
    total: sql<string>`SUM(${payments.amount})`,
    count: sql<number>`COUNT(*)`,
  }).from(payments).where(and(...conditions)).groupBy(payments.bankAccountId);

  const accounts = await listBankAccounts(userId);
  return rows.map((r) => {
    const acc = accounts.find((a: any) => a.id === r.bankAccountId);
    return {
      bankAccountId: r.bankAccountId,
      accountName: acc?.name ?? (r.bankAccountId ? `Conta #${r.bankAccountId}` : "Manual / Sem conta"),
      accountBank: acc?.bank ?? null,
      accountColor: acc?.color ?? "#6366f1",
      total: parseFloat(r.total ?? "0"),
      count: r.count,
    };
  }).sort((a, b) => b.total - a.total);
}

// ─── Configuração de IA ───────────────────────────────────────────────────────

export async function getAISettings(userId: number): Promise<AIConfig> {
  const db = await getDb();
  const groupId = await getUserGroupId(userId);
  const rows = groupId
    ? await db?.select().from(aiSettings).where(eq(aiSettings.groupId, groupId)).limit(1)
    : await db?.select().from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);

  const row = rows?.[0];
  const { ENV } = await import("./_core/env");
  // Fallback para Manus usando URL e chave do ambiente (configuração original do sistema)
  if (!row || !row.apiKey) {
    const manusUrl = ENV.forgeApiUrl ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : undefined;
    return { provider: "manus", apiKey: ENV.forgeApiKey ?? "", model: "gemini-2.5-flash", apiUrl: manusUrl };
  }
  return { provider: row.provider as AIProvider, apiKey: row.apiKey, model: row.model ?? undefined };
}

export async function saveAISettings(userId: number, data: { provider: AIProvider; apiKey: string; model?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const groupId = await getUserGroupId(userId);

  const existing = groupId
    ? await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.groupId, groupId)).limit(1)
    : await db.select({ id: aiSettings.id }).from(aiSettings).where(eq(aiSettings.userId, userId)).limit(1);

  if (existing.length > 0) {
    await db.update(aiSettings).set({ ...data, model: data.model ?? null }).where(eq(aiSettings.id, existing[0].id));
  } else {
    await db.insert(aiSettings).values({ userId, groupId, ...data, model: data.model ?? null });
  }
}

// ─── Enviar Holerites por Email ────────────────────────────────────────────────

export async function getPayslipsForMonth(userId: number, yearMonth: string) {
  const db = await getDb();
  if (!db) return [];
  const groupId = await getUserGroupId(userId);

  const rows = groupId
    ? await db
        .select({ emp: employees, payroll: employeePayments })
        .from(employeePayments)
        .innerJoin(employees, eq(employees.id, employeePayments.employeeId))
        .where(and(eq(employeePayments.groupId, groupId), eq(employeePayments.yearMonth, yearMonth)))
    : await db
        .select({ emp: employees, payroll: employeePayments })
        .from(employeePayments)
        .innerJoin(employees, eq(employees.id, employeePayments.employeeId))
        .where(and(eq(employeePayments.userId, userId), eq(employeePayments.yearMonth, yearMonth)));

  return rows.map((r) => ({
    employeeId: r.emp.id,
    fullName: r.emp.fullName,
    email: r.emp.email ?? null,
    pdfUrl: r.payroll.pdfUrl ?? null,
    yearMonth: r.payroll.yearMonth,
  }));
}

// ─── Aprendizado de Categorização ─────────────────────────────────────────────

/** Normaliza a descrição para usar como padrão de aprendizado.
 *  "Pix enviado - L&f Boutique" → "l&f boutique"
 *  "L&f Boutique" → "l&f boutique"
 */
export function normalizePattern(description: string): string {
  const parts = description.split(" - ");
  const name = parts.length > 1 ? parts.slice(1).join(" - ") : description;
  return name.toLowerCase().trim();
}

/** Salva ou atualiza uma regra aprendida ao aprovar uma transação */
export async function upsertStatementRule(userId: number, data: {
  pattern: string;
  category: string;
  profile: "Pessoal" | "Empresa";
  suggestedDescription: string;
}) {
  const db = await getDb();
  if (!db) return;
  const groupId = await getUserGroupId(userId);

  // Tenta inserir; se já existe (mesmo userId+pattern), incrementa usageCount
  await db.execute(sql`
    INSERT INTO statement_rules (userId, groupId, pattern, category, profile, suggestedDescription, usageCount)
    VALUES (${userId}, ${groupId}, ${data.pattern}, ${data.category}, ${data.profile}, ${data.suggestedDescription}, 1)
    ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      profile = VALUES(profile),
      suggestedDescription = VALUES(suggestedDescription),
      usageCount = usageCount + 1
  `);
}

/** Busca todas as regras do usuário como mapa pattern → regra */
export async function getStatementRules(userId: number): Promise<Map<string, { category: string; profile: "Pessoal" | "Empresa"; suggestedDescription: string }>> {
  const db = await getDb();
  if (!db) return new Map();
  const groupId = await getUserGroupId(userId);

  const rows = groupId
    ? await db.select().from(statementRules).where(eq(statementRules.groupId, groupId))
    : await db.select().from(statementRules).where(eq(statementRules.userId, userId));

  const map = new Map<string, { category: string; profile: "Pessoal" | "Empresa"; suggestedDescription: string }>();
  for (const r of rows) {
    map.set(r.pattern, {
      category: r.category,
      profile: r.profile as "Pessoal" | "Empresa",
      suggestedDescription: r.suggestedDescription ?? r.pattern,
    });
  }
  return map;
}

/** Aplica sugestões da IA (categoria, perfil, descrição) em linhas pendentes sem aprová-las */
export async function applyAISuggestionsToRows(updates: { id: number; category: string; profile: string; description: string }[]) {
  const db = await getDb();
  if (!db || updates.length === 0) return;
  for (const u of updates) {
    await db.update(statementRows)
      .set({ suggestedCategory: u.category, suggestedProfile: u.profile as "Pessoal" | "Empresa", suggestedDescription: u.description, confidence: "0.95" })
      .where(and(eq(statementRows.id, u.id), eq(statementRows.status, "pending")));
  }
}

/** Ao aprovar uma linha, propaga a categoria para todas as outras linhas pendentes
 *  do mesmo import que tenham o mesmo padrão (nome). Retorna o count propagado. */
export async function propagateCategoryToSiblings(
  userId: number,
  importId: number,
  pattern: string,
  category: string,
  profile: "Pessoal" | "Empresa",
  suggestedDescription: string,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Busca todas as linhas pendentes do mesmo import
  const pending = await db
    .select()
    .from(statementRows)
    .where(and(eq(statementRows.importId, importId), eq(statementRows.status, "pending"), eq(statementRows.userId, userId)));

  let count = 0;
  for (const row of pending) {
    if (normalizePattern(row.description) === pattern) {
      await db.update(statementRows)
        .set({ suggestedCategory: category, suggestedProfile: profile, suggestedDescription, confidence: "0.98" })
        .where(eq(statementRows.id, row.id));
      count++;
    }
  }
  return count;
}
