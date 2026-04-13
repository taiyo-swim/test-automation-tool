import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "./db.js";
import { redis } from "./queue/redis.js";
import { authRoutes } from "./modules/auth/routes.js";
import { projectRoutes } from "./modules/projects/routes.js";
import { testRoutes } from "./modules/tests/routes.js";
import { runRoutes } from "./modules/runs/routes.js";
import { teamRoutes } from "./modules/teams/routes.js";
import { internalRoutes } from "./modules/internal/routes.js";
import { scheduleRoutes } from "./modules/schedules/routes.js";
import { wsHandler } from "./websocket/handler.js";
import { startWorkers } from "./queue/workers.js";
import { setupStorage } from "./storage/index.js";
import { startScheduler } from "./scheduler/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 52_428_800, // 50 MB (for screenshot uploads)
  });

  // ── Plugins ────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.APP_URL ?? "http://localhost:3000",
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  });

  await app.register(websocket);

  // Storage setup (local static file serving or S3)
  await setupStorage(app);

  // ── Decorators ─────────────────────────────────────────────────────
  app.decorate(
    "authenticate",
    async function authenticate(request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        reply
          .code(401)
          .send({ error: "Unauthorized", message: "Invalid or expired token", statusCode: 401 });
      }
    }
  );

  // ── Routes ─────────────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(testRoutes, { prefix: "/api/projects" });
  await app.register(runRoutes, { prefix: "/api" });
  await app.register(teamRoutes, { prefix: "/api/teams" });
  await app.register(internalRoutes, { prefix: "/internal" });
  await app.register(scheduleRoutes, { prefix: "/api/projects" });

  // WebSocket
  app.get("/ws", { websocket: true }, wsHandler);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // ── Workers & Scheduler ────────────────────────────────────────────
  await startWorkers();
  startScheduler();

  // ── Graceful Shutdown ──────────────────────────────────────────────
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  return app;
}
