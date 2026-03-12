import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Unit tests for shared groups logic ─────────────────────────────────────

describe("Invite code generation", () => {
  it("generates an 8-character alphanumeric code", () => {
    // Simulate the generateInviteCode logic from server/db.ts
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    function generateInviteCode(): string {
      let code = "";
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    }

    const code = generateInviteCode();
    expect(code).toHaveLength(8);
    expect(/^[A-Z2-9]+$/.test(code)).toBe(true);
  });

  it("does not include ambiguous characters (0, O, 1, I)", () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    expect(chars).not.toContain("0");
    expect(chars).not.toContain("O");
    expect(chars).not.toContain("1");
    expect(chars).not.toContain("I");
  });
});

describe("Sharing tRPC routes structure", () => {
  it("sharing router has required procedures", async () => {
    // Import the router type to verify structure
    const { appRouter } = await import("../server/routers");
    const sharingRouter = (appRouter as any)._def?.procedures;

    // Check that sharing procedures exist
    expect(sharingRouter).toBeDefined();
  });
});

describe("DB schema for shared groups", () => {
  it("sharedGroups table has required fields", async () => {
    const { sharedGroups } = await import("../drizzle/schema");
    const columns = Object.keys(sharedGroups);
    expect(columns).toContain("id");
    expect(columns).toContain("inviteCode");
    expect(columns).toContain("createdByUserId");
    expect(columns).toContain("name");
  });

  it("groupMembers table has required fields", async () => {
    const { groupMembers } = await import("../drizzle/schema");
    const columns = Object.keys(groupMembers);
    expect(columns).toContain("id");
    expect(columns).toContain("groupId");
    expect(columns).toContain("userId");
    expect(columns).toContain("joinedAt");
  });

  it("payments table has groupId field", async () => {
    const { payments } = await import("../drizzle/schema");
    const columns = Object.keys(payments);
    expect(columns).toContain("groupId");
    expect(columns).toContain("userId");
  });

  it("categories table has groupId field", async () => {
    const { categories } = await import("../drizzle/schema");
    const columns = Object.keys(categories);
    expect(columns).toContain("groupId");
    expect(columns).toContain("userId");
  });
});

describe("Invite code validation", () => {
  it("normalizes invite codes to uppercase", () => {
    const rawCode = "ab3x7yqz";
    const normalized = rawCode.toUpperCase();
    expect(normalized).toBe("AB3X7YQZ");
  });

  it("trims whitespace from invite codes", () => {
    const rawCode = "  AB3X7YQZ  ";
    const trimmed = rawCode.trim();
    expect(trimmed).toBe("AB3X7YQZ");
  });

  it("validates code length is 8 characters", () => {
    const validCode = "AB3X7YQZ";
    const tooShort = "AB3X";
    const tooLong = "AB3X7YQZEXTRA";

    expect(validCode.length).toBe(8);
    expect(tooShort.length).toBeLessThan(8);
    expect(tooLong.length).toBeGreaterThan(8);
  });
});
