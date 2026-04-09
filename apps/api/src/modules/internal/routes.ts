import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../db.js";
import { broadcast } from "../../websocket/handler.js";
import { saveFile } from "../../storage/index.js";
import { notifySlack } from "../../notifications/slack.js";
import type { WsEvent } from "@e2e-tool/types";

/**
 * Internal routes — called by Runner services only.
 * Authenticated with shared RUNNER_SECRET header (not JWT).
 */
export const internalRoutes: FastifyPluginAsync = async (app) => {
  // Middleware: verify runner secret
  app.addHook("onRequest", async (request, reply) => {
    const secret = request.headers["x-runner-secret"];
    const expected = process.env.RUNNER_SECRET ?? "runner-internal-secret";
    if (secret !== expected) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid runner secret", statusCode: 401 });
    }
  });

  // ── Runs ──────────────────────────────────────────────────────────

  // GET /internal/runs/:runId — fetch run + test IDs
  app.get("/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await prisma.testRun.findUnique({
      where: { id: runId },
      include: { results: { select: { testId: true, status: true, id: true } } },
    });
    if (!run) return reply.code(404).send({ error: "Not Found", message: "Run not found", statusCode: 404 });
    return reply.send(run);
  });

  // PATCH /internal/runs/:runId — update run status
  app.patch("/runs/:runId", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = request.body as { status: string; finishedAt?: string };
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: body.status,
        ...(body.status === "running" && { startedAt: new Date() }),
        ...(body.finishedAt && { finishedAt: new Date(body.finishedAt) }),
        ...(!body.finishedAt &&
          (body.status === "passed" || body.status === "failed" || body.status === "cancelled") && {
            finishedAt: new Date(),
          }),
      },
    });

    // Slack notification on run completion
    if (body.status === "passed" || body.status === "failed" || body.status === "cancelled") {
      const run = await prisma.testRun.findUnique({
        where: { id: runId },
        include: { results: { select: { status: true } } },
      });
      if (run && process.env.SLACK_WEBHOOK_URL) {
        const startedAt = run.startedAt ? run.startedAt.getTime() : Date.now();
        const finishedAt = run.finishedAt ? run.finishedAt.getTime() : Date.now();
        notifySlack({
          runId,
          projectId: run.projectId,
          status: body.status as "passed" | "failed" | "cancelled",
          trigger: run.trigger,
          totalTests: run.results.length,
          passedTests: run.results.filter((r) => r.status === "passed").length,
          failedTests: run.results.filter((r) => r.status === "failed").length,
          durationMs: finishedAt - startedAt,
          appUrl: process.env.APP_URL ?? "http://localhost:3000",
        }).catch(() => {}); // fire-and-forget
      }
    }

    return reply.send({ ok: true });
  });

  // POST /internal/runs/:runId/results — create a TestRunResult
  app.post("/runs/:runId/results", async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const body = request.body as { testId: string };
    const result = await prisma.testRunResult.create({
      data: { runId, testId: body.testId, status: "running", startedAt: new Date() },
    });
    return reply.code(201).send(result);
  });

  // ── Results ───────────────────────────────────────────────────────

  // PATCH /internal/results/:resultId — update result status
  app.patch("/results/:resultId", async (request, reply) => {
    const { resultId } = request.params as { resultId: string };
    const body = request.body as {
      status: string;
      durationMs?: number;
      errorMessage?: string;
      videoUrl?: string;
    };
    await prisma.testRunResult.update({
      where: { id: resultId },
      data: {
        status: body.status,
        durationMs: body.durationMs,
        errorMessage: body.errorMessage ?? null,
        videoUrl: body.videoUrl ?? null,
        finishedAt: new Date(),
      },
    });
    return reply.send({ ok: true });
  });

  // POST /internal/results/:resultId/steps — create a StepResult
  app.post("/results/:resultId/steps", async (request, reply) => {
    const { resultId } = request.params as { resultId: string };
    const body = request.body as {
      stepId: string;
      order: number;
      status: string;
      screenshotUrl?: string;
      logText?: string;
      durationMs?: number;
      executedAt?: string;
    };
    const stepResult = await prisma.stepResult.create({
      data: {
        runResultId: resultId,
        stepId: body.stepId,
        order: body.order,
        status: body.status,
        screenshotPath: body.screenshotUrl ?? null,
        logText: body.logText ?? null,
        durationMs: body.durationMs ?? null,
        executedAt: body.executedAt ? new Date(body.executedAt) : new Date(),
      },
    });
    return reply.code(201).send({
      ...stepResult,
      screenshotUrl: stepResult.screenshotPath,
    });
  });

  // ── Tests ─────────────────────────────────────────────────────────

  // GET /internal/tests/:testId — fetch test with steps
  app.get("/tests/:testId", async (request, reply) => {
    const { testId } = request.params as { testId: string };
    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        steps: { orderBy: { order: "asc" } },
        project: { select: { id: true, platform: true, baseUrl: true } },
      },
    });
    if (!test) return reply.code(404).send({ error: "Not Found", message: "Test not found", statusCode: 404 });

    return reply.send({
      id: test.id,
      projectId: test.projectId,
      platform: test.project.platform,
      name: test.name,
      baseUrl: test.project.baseUrl,
      steps: test.steps,
    });
  });

  // ── Environment Variables ─────────────────────────────────────────

  // GET /internal/projects/:projectId/env/:envName
  app.get("/projects/:projectId/env/:envName", async (request, reply) => {
    const { projectId, envName } = request.params as { projectId: string; envName: string };
    const env = await prisma.environment.findFirst({
      where: { projectId, name: envName },
    });
    if (!env) return reply.send({ variables: {} });
    return reply.send({ variables: env.variables });
  });

  // ── Visual Regression ─────────────────────────────────────────────

  // GET /internal/baselines/:projectId/:testId/:stepId
  app.get("/baselines/:projectId/:testId/:stepId", async (request, reply) => {
    const { projectId, testId, stepId } = request.params as {
      projectId: string;
      testId: string;
      stepId: string;
    };
    const baseline = await prisma.visualBaseline.findUnique({
      where: { projectId_testId_stepId: { projectId, testId, stepId } },
    });
    if (!baseline) return reply.code(404).send({ error: "Not Found", message: "No baseline", statusCode: 404 });
    return reply.send(baseline);
  });

  // POST /internal/baselines — create or update baseline
  app.post("/baselines", async (request, reply) => {
    const body = request.body as {
      projectId: string;
      testId: string;
      stepId: string;
      imagePath: string;
    };
    const baseline = await prisma.visualBaseline.upsert({
      where: { projectId_testId_stepId: { projectId: body.projectId, testId: body.testId, stepId: body.stepId } },
      create: body,
      update: { imagePath: body.imagePath },
    });
    return reply.code(201).send(baseline);
  });

  // POST /internal/visual-diffs
  app.post("/visual-diffs", async (request, reply) => {
    const body = request.body as {
      stepResultId: string;
      baselineId: string;
      diffImagePath: string;
      diffPercentage: number;
    };
    const diff = await prisma.visualDiff.create({
      data: {
        stepResultId: body.stepResultId,
        baselineId: body.baselineId,
        diffImagePath: body.diffImagePath,
        diffPercentage: body.diffPercentage,
        status: body.diffPercentage > 0.5 ? "pending" : "approved",
      },
    });
    return reply.code(201).send(diff);
  });

  // ── Self-Healing ──────────────────────────────────────────────────

  // POST /internal/healing-suggestions
  app.post("/healing-suggestions", async (request, reply) => {
    const body = request.body as {
      stepResultId: string;
      originalSelector: string;
      suggestedSelector: string;
      confidence: number;
      reason: string;
    };
    const suggestion = await prisma.healingSuggestion.create({ data: body });
    return reply.code(201).send(suggestion);
  });

  // ── WebSocket Broadcast ───────────────────────────────────────────

  // POST /internal/ws-broadcast — broadcast event to connected clients
  app.post("/ws-broadcast", async (request, reply) => {
    const body = request.body as { runId: string; event: WsEvent };
    broadcast(body.runId, body.event);
    return reply.send({ ok: true });
  });

  // ── Screenshot Upload ─────────────────────────────────────────────

  // POST /internal/screenshots/:runId/:filename — upload screenshot binary
  app.post("/screenshots/:runId/:filename", {
    config: { rawBody: true },
  }, async (request, reply) => {
    const { runId, filename } = request.params as { runId: string; filename: string };
    const body = request.body as Buffer;

    const relativePath = `screenshots/${runId}/${filename}`;
    const url = await saveFile(relativePath, body);

    return reply.code(201).send({ url });
  });
};
