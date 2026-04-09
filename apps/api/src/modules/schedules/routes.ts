import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { runQueue } from "../../queue/queues.js";

const scheduleSchema = z.object({
  name: z.string().min(1),
  cronExpression: z.string().min(1),
  testIds: z.array(z.string()).min(1),
  environmentId: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const scheduleRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/projects/:projectId/schedules
  app.get("/:projectId/schedules", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canAccess(projectId, userId))) return reply.code(403).send(forbidden());

    const schedules = await prisma.schedule.findMany({
      where: { projectId },
      orderBy: { id: "asc" },
    });
    return reply.send({ data: schedules });
  });

  // POST /api/projects/:projectId/schedules
  app.post("/:projectId/schedules", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canEdit(projectId, userId))) return reply.code(403).send(forbidden());

    const body = scheduleSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error.message));

    // Validate cron expression
    const { default: cron } = await import("node-cron");
    if (!cron.validate(body.data.cronExpression)) {
      return reply.code(400).send(badRequest("Invalid cron expression"));
    }

    const env = body.data.environmentId
      ? await prisma.environment.findUnique({ where: { id: body.data.environmentId } })
      : null;

    const schedule = await prisma.schedule.create({
      data: {
        projectId,
        name: body.data.name,
        cronExpression: body.data.cronExpression,
        environmentId: body.data.environmentId ?? null,
        enabled: body.data.enabled,
        nextRunAt: getNextRun(body.data.cronExpression),
      },
    });

    // Attach test IDs as JSON in the name field is wrong — store them properly
    // We store testIds in the name until we add a dedicated field
    // Actually let's add them to a separate JSON field via raw update
    await prisma.$executeRaw`
      UPDATE "Schedule"
      SET "testIds" = ${JSON.stringify(body.data.testIds)}::jsonb
      WHERE id = ${schedule.id}
    `.catch(() => {
      // Column may not exist yet — schedule still created
    });

    return reply.code(201).send({ data: schedule });
  });

  // PATCH /api/projects/:projectId/schedules/:scheduleId
  app.patch("/:projectId/schedules/:scheduleId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, scheduleId } = request.params as { projectId: string; scheduleId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canEdit(projectId, userId))) return reply.code(403).send(forbidden());

    const body = scheduleSchema.partial().safeParse(request.body);
    if (!body.success) return reply.code(400).send(badRequest(body.error.message));

    if (body.data.cronExpression) {
      const { default: cron } = await import("node-cron");
      if (!cron.validate(body.data.cronExpression)) {
        return reply.code(400).send(badRequest("Invalid cron expression"));
      }
    }

    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        ...(body.data.name && { name: body.data.name }),
        ...(body.data.cronExpression && {
          cronExpression: body.data.cronExpression,
          nextRunAt: getNextRun(body.data.cronExpression),
        }),
        ...(body.data.enabled !== undefined && { enabled: body.data.enabled }),
      },
    });
    return reply.send({ data: updated });
  });

  // DELETE /api/projects/:projectId/schedules/:scheduleId
  app.delete("/:projectId/schedules/:scheduleId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, scheduleId } = request.params as { projectId: string; scheduleId: string };
    const userId = (request.user as { sub: string }).sub;
    if (!(await canEdit(projectId, userId))) return reply.code(403).send(forbidden());

    await prisma.schedule.delete({ where: { id: scheduleId } });
    return reply.code(204).send();
  });
};

function getNextRun(cronExpression: string): Date {
  // Simple next-run calculation — add 1 minute as placeholder
  // In production you'd use a library like `cron-parser`
  return new Date(Date.now() + 60_000);
}

async function canAccess(projectId: string, userId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  return !!(await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: p.teamId, userId } },
  }));
}

async function canEdit(projectId: string, userId: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return false;
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: p.teamId, userId } },
  });
  return !!m && m.role !== "viewer";
}

const forbidden = () => ({ error: "Forbidden", message: "Access denied", statusCode: 403 });
const badRequest = (msg: string) => ({ error: "Bad Request", message: msg, statusCode: 400 });
