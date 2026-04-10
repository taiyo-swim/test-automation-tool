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
      parallelism: z.number().int().min(1).max(10).default(1),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const run = await createRun(
      projectId,
      body.data.testIds,
      "manual",
      body.data.environment,
      userId,
      body.data.parallelism,
    );
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
      tag: z.string().optional(),
      status: z.string().optional(),
    }).safeParse(request.query);

    const page = query.success ? query.data.page : 1;
    const pageSize = query.success ? query.data.pageSize : 20;
    const tagFilter = query.success ? query.data.tag : undefined;
    const statusFilter = query.success ? query.data.status : undefined;

    // If filtering by tag, find test IDs that have that tag first
    let tagTestIds: string[] | undefined;
    if (tagFilter) {
      const tests = await prisma.test.findMany({
        where: { projectId, tags: { has: tagFilter } },
        select: { id: true },
      });
      tagTestIds = tests.map((t) => t.id);
    }

    const where = {
      projectId,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(tagTestIds !== undefined
        ? { results: { some: { testId: { in: tagTestIds } } } }
        : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.testRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          results: { select: { status: true } },
          triggeredBy: { select: { id: true, name: true } },
        },
      }),
      prisma.testRun.count({ where }),
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

  // POST /api/visual-diffs/:id/reject
  app.post("/visual-diffs/:id/reject", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await prisma.visualDiff.update({ where: { id }, data: { status: "rejected" } });
    return reply.send({ data: { ok: true } });
  });

  // POST /api/visual-baselines/:id/update — promote current screenshot as new baseline
  app.post("/visual-baselines/:id/update", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { newImageUrl: string };

    const baseline = await prisma.visualBaseline.findUnique({ where: { id } });
    if (!baseline) {
      return reply.code(404).send({ error: "Not Found", message: "Baseline not found", statusCode: 404 });
    }

    // Derive relative storage path from URL: /api/files/<path> → <path>
    const relativePath = body.newImageUrl.replace(/^\/api\/files\//, "");
    await prisma.visualBaseline.update({ where: { id }, data: { imagePath: relativePath } });
    return reply.send({ data: { ok: true } });
  });

  // GET /api/projects/:projectId/analytics/flaky — top flaky tests
  app.get("/projects/:projectId/analytics/flaky", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    // Look at the last 30 days of results grouped by testId
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await prisma.testRunResult.findMany({
      where: {
        run: { projectId, createdAt: { gte: since } },
        status: { in: ["passed", "failed"] },
      },
      select: { testId: true, status: true },
    });

    const byTest = new Map<string, { passed: number; failed: number }>();
    for (const r of results) {
      const entry = byTest.get(r.testId) ?? { passed: 0, failed: 0 };
      if (r.status === "passed") entry.passed++;
      else entry.failed++;
      byTest.set(r.testId, entry);
    }

    // Calculate flakiness: tests that both passed AND failed (at least once each)
    const flaky: { testId: string; passed: number; failed: number; total: number; failRate: number }[] = [];
    for (const [testId, counts] of byTest) {
      if (counts.passed > 0 && counts.failed > 0) {
        const total = counts.passed + counts.failed;
        flaky.push({ testId, ...counts, total, failRate: counts.failed / total });
      }
    }

    flaky.sort((a, b) => b.failRate - a.failRate);

    // Attach test names
    const testIds = flaky.map((f) => f.testId);
    const tests = await prisma.test.findMany({ where: { id: { in: testIds } }, select: { id: true, name: true } });
    const testMap = new Map(tests.map((t) => [t.id, t.name]));

    return reply.send({
      data: flaky.map((f) => ({ ...f, testName: testMap.get(f.testId) ?? f.testId })),
    });
  });

  // GET /api/projects/:projectId/analytics/trends — daily pass rate & avg duration (last N days)
  app.get("/projects/:projectId/analytics/trends", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const q = z.object({ days: z.coerce.number().int().min(7).max(90).default(30) }).safeParse(request.query);
    const days = q.success ? q.data.days : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const runs = await prisma.testRun.findMany({
      where: { projectId, createdAt: { gte: since }, status: { in: ["passed", "failed"] } },
      select: { status: true, createdAt: true, results: { select: { durationMs: true, status: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Group by date (YYYY-MM-DD)
    const byDate = new Map<string, { passed: number; failed: number; totalMs: number; msCount: number }>();
    for (const run of runs) {
      const date = run.createdAt.toISOString().slice(0, 10);
      const entry = byDate.get(date) ?? { passed: 0, failed: 0, totalMs: 0, msCount: 0 };
      if (run.status === "passed") entry.passed++;
      else entry.failed++;
      for (const r of run.results) {
        if (r.durationMs != null) { entry.totalMs += r.durationMs; entry.msCount++; }
      }
      byDate.set(date, entry);
    }

    const data = Array.from(byDate.entries()).map(([date, v]) => ({
      date,
      passRate: v.passed + v.failed > 0 ? Math.round((v.passed / (v.passed + v.failed)) * 100) : null,
      runs: v.passed + v.failed,
      avgDurationMs: v.msCount > 0 ? Math.round(v.totalMs / v.msCount) : null,
    }));

    return reply.send({ data });
  });

  // GET /api/projects/:projectId/analytics/slowest — slowest tests (avg duration)
  app.get("/projects/:projectId/analytics/slowest", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const results = await prisma.testRunResult.findMany({
      where: { run: { projectId, createdAt: { gte: since } }, durationMs: { not: null } },
      select: { testId: true, durationMs: true },
    });

    const byTest = new Map<string, { total: number; count: number }>();
    for (const r of results) {
      const e = byTest.get(r.testId) ?? { total: 0, count: 0 };
      e.total += r.durationMs!;
      e.count++;
      byTest.set(r.testId, e);
    }

    const ranked = Array.from(byTest.entries())
      .map(([testId, v]) => ({ testId, avgDurationMs: Math.round(v.total / v.count), runCount: v.count }))
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, 10);

    const tests = await prisma.test.findMany({
      where: { id: { in: ranked.map((r) => r.testId) } },
      select: { id: true, name: true, tags: true },
    });
    const testMap = new Map(tests.map((t) => [t.id, t]));

    return reply.send({
      data: ranked.map((r) => ({ ...r, testName: testMap.get(r.testId)?.name ?? r.testId, tags: testMap.get(r.testId)?.tags ?? [] })),
    });
  });

  // GET /api/projects/:projectId/notification-settings
  app.get("/projects/:projectId/notification-settings", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const setting = await prisma.notificationSetting.findUnique({ where: { projectId } });
    return reply.send({ data: setting });
  });

  // PATCH /api/projects/:projectId/notification-settings
  app.patch("/projects/:projectId/notification-settings", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const body = z.object({
      slackWebhookUrl: z.string().url().nullish(),
      notifyOnFailure: z.boolean().optional(),
      notifyOnRecovery: z.boolean().optional(),
      notifyOnSuccess: z.boolean().optional(),
      emailRecipients: z.array(z.string().email()).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });

    const setting = await prisma.notificationSetting.upsert({
      where: { projectId },
      create: { projectId, ...body.data },
      update: body.data,
    });
    return reply.send({ data: setting });
  });

  // GET /api/projects/:projectId/tests/:testId/datasets
  app.get("/projects/:projectId/tests/:testId/datasets", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const datasets = await prisma.testDataSet.findMany({ where: { testId } });
    return reply.send({ data: datasets });
  });

  // POST /api/projects/:projectId/tests/:testId/datasets
  app.post("/projects/:projectId/tests/:testId/datasets", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    const body = z.object({ name: z.string().min(1), csvContent: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });

    const dataset = await prisma.testDataSet.create({
      data: { testId, name: body.data.name, csvContent: body.data.csvContent },
    });
    return reply.code(201).send({ data: dataset });
  });

  // DELETE /api/projects/:projectId/tests/:testId/datasets/:datasetId
  app.delete("/projects/:projectId/tests/:testId/datasets/:datasetId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, datasetId } = request.params as { projectId: string; testId: string; datasetId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccessProject(projectId, userId))) return reply.code(403).send(forbidden());

    await prisma.testDataSet.delete({ where: { id: datasetId } });
    return reply.code(204).send();
  });
};

const forbidden = () => ({ error: "Forbidden", message: "Access denied", statusCode: 403 });

async function createRun(
  projectId: string,
  testIds: string[],
  trigger: "manual" | "schedule" | "api" | "ci",
  environment?: string,
  triggeredById?: string,
  parallelism = 1,
) {
  const run = await prisma.testRun.create({
    data: {
      projectId,
      trigger,
      status: "queued",
      environment: environment ?? null,
      triggeredById: triggeredById ?? null,
      parallelism,
    },
  });

  await runQueue.add("run", {
    runId: run.id,
    projectId,
    testIds,
    environment,
    parallelism,
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
