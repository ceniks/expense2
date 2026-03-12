import { describe, it, expect } from "vitest";

// ─── Inline the pure helper functions to avoid importing React/tRPC deps ─────

interface CustomCategory {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_CATEGORIES: CustomCategory[] = [
  { id: "alimentacao", name: "Alimentação", color: "#FF6B6B" },
  { id: "transporte", name: "Transporte", color: "#4ECDC4" },
  { id: "saude", name: "Saúde", color: "#45B7D1" },
  { id: "moradia", name: "Moradia", color: "#96CEB4" },
  { id: "lazer", name: "Lazer", color: "#FFEAA7" },
  { id: "educacao", name: "Educação", color: "#DDA0DD" },
  { id: "vestuario", name: "Vestuário", color: "#98D8C8" },
  { id: "servicos", name: "Serviços", color: "#F7DC6F" },
  { id: "outros", name: "Outros", color: "#BDC3C7" },
];

function getCategoryColor(categories: CustomCategory[], name: string): string {
  return categories.find((c) => c.name === name)?.color ?? "#BDC3C7";
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DEFAULT_CATEGORIES", () => {
  it("should have all expected categories", () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name);
    expect(names).toContain("Alimentação");
    expect(names).toContain("Transporte");
    expect(names).toContain("Saúde");
    expect(names).toContain("Moradia");
    expect(names).toContain("Lazer");
    expect(names).toContain("Educação");
    expect(names).toContain("Vestuário");
    expect(names).toContain("Serviços");
    expect(names).toContain("Outros");
    expect(DEFAULT_CATEGORIES.length).toBe(9);
  });

  it("should have a valid hex color for every category", () => {
    for (const cat of DEFAULT_CATEGORIES) {
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("getCategoryColor", () => {
  it("should return the correct color for a known category", () => {
    const color = getCategoryColor(DEFAULT_CATEGORIES, "Alimentação");
    expect(color).toBe("#FF6B6B");
  });

  it("should return fallback color for unknown category", () => {
    const color = getCategoryColor(DEFAULT_CATEGORIES, "Inexistente");
    expect(color).toBe("#BDC3C7");
  });
});

describe("currency formatting", () => {
  it("should format BRL currency correctly", () => {
    const formatted = (1234.56).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    expect(formatted).toContain("1.234");
    expect(formatted).toContain("56");
  });
});

describe("date filtering logic", () => {
  const mockPayments = [
    { id: "1", date: "2026-03-01", amount: 100, description: "Test 1", category: "Alimentação", profile: "Pessoal" as const, createdAt: "" },
    { id: "2", date: "2026-03-15", amount: 200, description: "Test 2", category: "Transporte", profile: "Empresa" as const, createdAt: "" },
    { id: "3", date: "2026-02-28", amount: 50, description: "Test 3", category: "Lazer", profile: "Pessoal" as const, createdAt: "" },
    { id: "4", date: "2026-01-10", amount: 75, description: "Test 4", category: "Saúde", profile: "Pessoal" as const, createdAt: "" },
  ];

  function getMonthPayments(year: number, month: number, profile?: "Pessoal" | "Empresa" | "all") {
    return mockPayments.filter((p) => {
      const [y, m] = p.date.split("-").map(Number);
      const matchDate = y === year && m === month;
      const matchProfile = !profile || profile === "all" || p.profile === profile;
      return matchDate && matchProfile;
    });
  }

  it("should filter payments for March 2026", () => {
    const march = getMonthPayments(2026, 3);
    expect(march.length).toBe(2);
    expect(march.map(p => p.id)).toContain("1");
    expect(march.map(p => p.id)).toContain("2");
  });

  it("should filter payments for February 2026", () => {
    const feb = getMonthPayments(2026, 2);
    expect(feb.length).toBe(1);
    expect(feb[0].id).toBe("3");
  });

  it("should return empty array for months with no payments", () => {
    const empty = getMonthPayments(2025, 12);
    expect(empty.length).toBe(0);
  });

  it("should calculate correct monthly total", () => {
    const march = getMonthPayments(2026, 3);
    const total = march.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBe(300);
  });

  it("should filter by profile correctly", () => {
    const marchEmpresa = getMonthPayments(2026, 3, "Empresa");
    expect(marchEmpresa.length).toBe(1);
    expect(marchEmpresa[0].id).toBe("2");

    const marchPessoal = getMonthPayments(2026, 3, "Pessoal");
    expect(marchPessoal.length).toBe(1);
    expect(marchPessoal[0].id).toBe("1");
  });
});

describe("dbPaymentToLocal conversion", () => {
  it("should convert decimal string amount to number", () => {
    const dbPayment = {
      id: 42,
      description: "Teste",
      amount: "216.07",
      date: "2026-03-01",
      category: "Alimentação",
      profile: "Pessoal",
      imageUrl: "https://example.com/img.jpg",
      notes: null,
      createdAt: new Date("2026-03-01T20:00:00Z"),
    };

    const amount = typeof dbPayment.amount === "string"
      ? parseFloat(dbPayment.amount)
      : Number(dbPayment.amount);

    expect(amount).toBe(216.07);
    expect(typeof amount).toBe("number");
  });

  it("should handle null imageUrl gracefully", () => {
    const imageUrl: string | null = null;
    const imageUri = imageUrl !== null ? imageUrl : undefined;
    expect(imageUri).toBeUndefined();
  });
});
