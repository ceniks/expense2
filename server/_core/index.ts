// v2.1.0 - Polyfill crypto para Node.js < 19
import { webcrypto } from "crypto";
if (typeof globalThis.crypto === "undefined") {
  // @ts-ignore
  globalThis.crypto = webcrypto;
}

import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerEmailAuthRoutes } from "./auth-email";
import { registerMailgunWebhook } from "../mailgun-webhook";
import { appRouter } from "../routers";
import { createContext } from "./context";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);
  registerEmailAuthRoutes(app);
  registerMailgunWebhook(app);
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  // Em produção, serve o frontend estático gerado pelo Expo Web
  if (process.env.NODE_ENV === "production") {
    // __dirname aponta para /app/dist, então ../dist/web = /app/dist/web
    const webDistPath = path.resolve(__dirname, "web");
    app.use(express.static(webDistPath));
    // SPA fallback: qualquer rota não-API retorna o index.html
    app.get("*", (req, res) => {
      if (!req.path.startsWith("/api")) {
        res.sendFile(path.join(webDistPath, "index.html"));
      }
    });
    console.log(`[api] serving static frontend from ${webDistPath}`);
  }

  // Em produção, usar a porta exata do PORT sem buscar alternativas
  // O Railway exige que o servidor escute exatamente na porta configurada
  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
