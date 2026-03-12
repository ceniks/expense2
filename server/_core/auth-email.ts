import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";

const SALT_ROUNDS = 10;

function generateOpenId(email: string): string {
  // Gera um openId único baseado no email para compatibilidade com o sistema existente
  return `email_${Buffer.from(email.toLowerCase()).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 40)}`;
}

export function registerEmailAuthRoutes(app: Express) {
  // POST /api/auth/register — Cadastro com email e senha
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, password } = req.body ?? {};

    if (!name || !email || !password) {
      res.status(400).json({ error: "Nome, email e senha são obrigatórios" });
      return;
    }

    if (typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Email inválido" });
      return;
    }

    if (typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        console.error("[Auth] Register: DATABASE_URL not set or connection failed");
        res.status(503).json({ error: "Banco de dados indisponível. Verifique a variável DATABASE_URL no servidor." });
        return;
      }

      // Verificar se email já existe
      const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: "Este email já está cadastrado" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const openId = generateOpenId(email);

      await db.insert(users).values({
        openId,
        name: name.trim(),
        email: email.toLowerCase(),
        loginMethod: "email",
        passwordHash,
        lastSignedIn: new Date(),
      });

      const newUser = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      const user = newUser[0];
      if (!user) {
        res.status(500).json({ error: "Erro ao criar usuário" });
        return;
      }

      const sessionToken = await sdk.signSession(
        { openId: user.openId, appId: "gastopix", name: user.name ?? "" },
        { expiresInMs: ONE_YEAR_MS }
      );

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          openId: user.openId,
        },
      });
    } catch (error: any) {
      console.error("[Auth] Register error:", error?.message ?? error);
      res.status(500).json({ error: `Erro interno ao criar conta: ${error?.message ?? "desconhecido"}` });
    }
  });

  // POST /api/auth/login — Login com email e senha
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email e senha são obrigatórios" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Banco de dados indisponível" });
        return;
      }

      const found = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
      const user = found[0];

      if (!user || !user.passwordHash) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        res.status(401).json({ error: "Email ou senha incorretos" });
        return;
      }

      // Atualizar lastSignedIn
      await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

      const sessionToken = await sdk.signSession(
        { openId: user.openId, appId: "gastopix", name: user.name ?? "" },
        { expiresInMs: ONE_YEAR_MS }
      );

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          openId: user.openId,
        },
      });
    } catch (error: any) {
      console.error("[Auth] Login error:", error?.message ?? error);
      res.status(500).json({ error: `Erro interno ao fazer login: ${error?.message ?? "desconhecido"}` });
    }
  });
}
