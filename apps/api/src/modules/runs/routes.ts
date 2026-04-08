import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "../../db.js";
import { runQueue } from "../../queue/queues.js";

export const runRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/projects/:projectId/runs — ログインユーザーからの実行
  app.post("/projects/:projectId/runs", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const body = z.object({
      testIds: z.array(z.string()).min(1),
      environment: z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const run = await createRun(projectId, body.data.testIds, "manual", body.data.environment, userId);
    return reply.code(202).send({ data: { runId: run.id, status: run.status } });
  });

  // POST /api/v1/runs — CI/CD APIトークンからの実行
  app.post("/v1/runs", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized", message: "API token required", statusCode: 401 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash } });
    if (!apiToken) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid API token", statusCode: 401 });
    }

    // Update last used
    await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } });

    const body = z.object({
      testIds: z.array(z.string()).min(1),
      environment: z.string().optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const run = await createRun(apiToken.projectId, body.data.testIds, "ci", body.data.environment);
    return reply.code(202).send({ data: { runId: run.id, status: run.status } });
  });

  // GET /api/v1/runs/:runId — CI/CD ポーリング用
  app.get("/v1/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const authHeader = request.headers.authorization ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return reply.code(401).send({ error: "Unauthorized", message: "API token required", statusCode: 401 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const apiToken = await prisma.apiToken.findUnique({ where: { tokenHash } });
    if (!apiToken) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid API token", statusCode: 401 });
    }

    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      include: { results: { select: { testId: true, status: true } } },
    });
    if (!run || run.projectId !== apiToken.projectId) {
      return reply.code(404).send({ error: "Not Found", message: "Run not found", statusCode: 404 });
    }

    return reply.send({ data: run });
  });

  // GET /api/projects/:projectId/runs
  app.get("/projects/:projectId/runs", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(request.query);

    const page = query.success ? query.data.page : 1;
    const pageSize = query.success ? query.data.pageSize : 20;

    const [runs, total] = await Promise.all([
      prisma.testRun.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          results: { select: { status: true } },
          triggeredBy: { select: { id: true, name: true } },
        },
      }),
      prisma.testRun.count({ where: { projectId } }),
    ]);

    return reply.send({ data: runs, total, page, pageSize });
  });

  // GET /api/projects/:projectId/runs/:runId
  app.get("/projects/:projectId/runs/:runId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      include: {
        results: {
          include: {
            test: { select: { id: true, name: true } },
            stepResults: { orderBy: { order: "asc" } },
          },
          orderBy: { startedAt: "asc" },
        },
        triggeredBy: { select: { id: true, name: true } },
      },
    });

    if (!run || run.projectId !== projectId) {
      return reply.code(404).send({ error: "Not Found", message: "Run not found", statusCode: 404 });
    }

    return reply.send({ data: run });
  });

  // DELETE /api/projects/:projectId/runs/:runId/cancel
  app.delete("/projects/:projectId/runs/:runId/cancel", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, runId } = request.params as { projectId: string; runId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    await prisma.testRun.updateMany({
      where: { id: runId, projectId, status: { in: ["queued", "running"] } },
      data: { status: "cancelled", finishedAt: new Date() },
    });

    return reply.send({ data: { ok: true } });
  });

  // GET /api/projects/:projectId/runs/:runId/results/:resultId/steps
  app.get("/projects/:projectId/runs/:runId/results/:resultId/steps", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, runId, resultId } = request.params as { projectId: string; runId: string; resultId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const stepResults = await prisma.stepResult.findMany({
      where: { runResultId: resultId },
      orderBy: { order: "asc" },
      include: { visualDiff: true, healingSuggestion: true },
    });

    return reply.send({ data: stepResults });
  });

  // POST /api/healing-suggestions/:id/accept
  app.post("/healing-suggestions/:id/accept", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const suggestion = await prisma.healingSuggestion.findUnique({
      where: { id },
      include: { stepResult: { include: { runResult: { include: { run: true } } } } },
    });
    if (!suggestion) {
      return reply.code(404).send({ error: "Not Found", message: "Suggestion not found", statusCode: 404 });
    }

    await prisma.$transaction([
      prisma.healingSuggestion.update({ where: { id }, data: { status: "accepted" } }),
      prisma.testStep.update({
        where: { id: suggestion.stepResult.stepId },
        data: {
          params: {
            ...(suggestion.stepResult as { step?: { params?: Record<string, unknown> } }).step?.params,
            selector: suggestion.suggestedSelector,
          },
        },
      }),
    ]);

    return reply.send({ data: { ok: true } });
  });

  // POST /api/healing-suggestions/:id/reject
  app.post("/healing-suggestions/:id/reject", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.healingSuggestion.update({ where: { id }, data: { status: "rejected" } });
    return reply.send({ data: { ok: true } });
  });

  // POST /api/visual-diffs/:id/approve
  app.post("/visual-diffs/:id/approve", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.visualDiff.update({ where: { id }, data: { status: "approved" } });
    return reply.send({ data: { ok: true } });
  });
};

async function createRun(
  projectId: string,
  testIds: string[],
  trigger: "manual" | "schedule" | "api" | "ci",
  environment?: string,
  triggeredById?: string
) {
  const run = await prisma.testRun.create({
    data: {
      projectId,
      trigger,
      status: "queued",
      environment: environment ?? null,
      triggeredById: triggeredById ?? null,
    },
  });

  await runQueue.add("run", {
    runId: run.id,
    projectId,
    testIds,
    environment,
  });

  return run;
}

async function canAccessProject(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: project.teamId, userId } },
  });
  return !!member;
}
