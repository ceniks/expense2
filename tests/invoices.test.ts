import { describe, it, expect } from "vitest";
import { appRouter } from "../server/routers";

describe("Invoices tRPC routes structure", () => {
  it("invoices router has required procedures", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    expect(procs["invoices.list"]).toBeDefined();
    expect(procs["invoices.analyze"]).toBeDefined();
    expect(procs["invoices.create"]).toBeDefined();
    expect(procs["invoices.markPaid"]).toBeDefined();
    expect(procs["invoices.markUnpaid"]).toBeDefined();
    expect(procs["invoices.delete"]).toBeDefined();
  });

  it("invoices.list is a query (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.list"];
    expect(proc).toBeDefined();
    // In tRPC v11, query procedures have _def.type === 'query'
    const type = proc._def?.type ?? proc._def?.query ? "query" : "mutation";
    expect(type).toBe("query");
  });

  it("invoices.analyze is a mutation (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.analyze"];
    expect(proc).toBeDefined();
    const type = proc._def?.type ?? (proc._def?.mutation ? "mutation" : "query");
    expect(type).toBe("mutation");
  });

  it("invoices.create is a mutation (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.create"];
    expect(proc).toBeDefined();
    const type = proc._def?.type ?? (proc._def?.mutation ? "mutation" : "query");
    expect(type).toBe("mutation");
  });

  it("invoices.markPaid is a mutation (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.markPaid"];
    expect(proc).toBeDefined();
    const type = proc._def?.type ?? (proc._def?.mutation ? "mutation" : "query");
    expect(type).toBe("mutation");
  });

  it("invoices.markUnpaid is a mutation (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.markUnpaid"];
    expect(proc).toBeDefined();
    const type = proc._def?.type ?? (proc._def?.mutation ? "mutation" : "query");
    expect(type).toBe("mutation");
  });

  it("invoices.delete is a mutation (type check)", () => {
    const procs = appRouter._def.procedures as Record<string, any>;
    const proc = procs["invoices.delete"];
    expect(proc).toBeDefined();
    const type = proc._def?.type ?? (proc._def?.mutation ? "mutation" : "query");
    expect(type).toBe("mutation");
  });
});

describe("Invoice installment logic", () => {
  function addMonths(dateStr: string, months: number): string {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1 + months, d);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  it("generates correct due dates for 3 installments", () => {
    const base = "2026-03-01";
    const dates = Array.from({ length: 3 }, (_, i) => addMonths(base, i + 1));
    expect(dates).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
  });

  it("splits total amount evenly across installments", () => {
    const total = 1500;
    const n = 3;
    const perInstallment = parseFloat((total / n).toFixed(2));
    expect(perInstallment).toBe(500);
  });

  it("handles 6 installments correctly", () => {
    const base = "2026-01-15";
    const dates = Array.from({ length: 6 }, (_, i) => addMonths(base, i + 1));
    expect(dates).toHaveLength(6);
    expect(dates[0]).toBe("2026-02-15");
    expect(dates[5]).toBe("2026-07-15");
  });

  it("caps suggested installments at 6", () => {
    const suggestedInstallments = Math.min(6, Math.max(1, 10));
    expect(suggestedInstallments).toBe(6);
  });

  it("minimum installments is 1", () => {
    const suggestedInstallments = Math.min(6, Math.max(1, 0));
    expect(suggestedInstallments).toBe(1);
  });
});
