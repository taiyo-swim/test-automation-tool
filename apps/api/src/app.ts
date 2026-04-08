import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
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
import { fileRoutes } from "./modules/files/routes.js";
import { wsHandler } from "./websocket/handler.js";
import { startWorkers } from "./queue/workers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.APP_URL ?? "http://localhost:3000",
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  });

  await app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  const storagePath =
    process.env.STORAGE_LOCAL_PATH ?? path.join(__dirname, "../storage");

  await app.register(staticFiles, {
    root: storagePath,
    prefix: "/api/files/",
    decorateReply: false,
  });

  await app.register(websocket);

  // Auth decorator
  app.decorate(
    "authenticate",
    async function (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ error: "Unauthorized", message: "Invalid or expired token", statusCode: 401 });
      }
    }
  );

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(projectRoutes, { prefix: "/api/projects" });
  await app.register(testRoutes, { prefix: "/api/projects" });
  await app.register(runRoutes, { prefix: "/api" });
  await app.register(teamRoutes, { prefix: "/api/teams" });
  await app.register(fileRoutes, { prefix: "/api" });

  // WebSocket
  app.get("/ws", { websocket: true }, wsHandler);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Start BullMQ workers
  await startWorkers();

  // Graceful shutdown
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  return app;
}

// Extend Fastify types
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

import type { FastifyRequest, FastifyReply } from "fastify";
