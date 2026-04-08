import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";

const testSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  folderId: z.string().optional(),
});

const stepSchema = z.object({
  id: z.string().optional(),
  order: z.number().int().min(0),
  action: z.string(),
  params: z.record(z.unknown()),
  sharedStepId: z.string().optional(),
});

export const testRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/projects/:projectId/tests
  app.get("/:projectId/tests", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const tests = await prisma.test.findMany({
      where: { projectId, status: "active" },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { steps: true } } },
    });

    return reply.send({ data: tests });
  });

  // POST /api/projects/:projectId/tests
  app.post("/:projectId/tests", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const body = testSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const test = await prisma.test.create({ data: { projectId, ...body.data } });
    return reply.code(201).send({ data: test });
  });

  // GET /api/projects/:projectId/tests/:testId
  app.get("/:projectId/tests/:testId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: { steps: { orderBy: { order: "asc" } } },
    });

    if (!test || test.projectId !== projectId) {
      return reply.code(404).send({ error: "Not Found", message: "Test not found", statusCode: 404 });
    }

    return reply.send({ data: test });
  });

  // PATCH /api/projects/:projectId/tests/:testId
  app.patch("/:projectId/tests/:testId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const body = testSchema.partial().extend({ status: z.enum(["active", "archived"]).optional() }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const updated = await prisma.test.update({ where: { id: testId }, data: body.data });
    return reply.send({ data: updated });
  });

  // DELETE /api/projects/:projectId/tests/:testId
  app.delete("/:projectId/tests/:testId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    await prisma.test.delete({ where: { id: testId } });
    return reply.code(204).send();
  });

  // POST /api/projects/:projectId/tests/:testId/duplicate
  app.post("/:projectId/tests/:testId/duplicate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const original = await prisma.test.findUnique({
      where: { id: testId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!original) {
      return reply.code(404).send({ error: "Not Found", message: "Test not found", statusCode: 404 });
    }

    const copy = await prisma.test.create({
      data: {
        projectId,
        name: `${original.name} (Copy)`,
        description: original.description ?? undefined,
        tags: original.tags,
        steps: {
          create: original.steps.map((s) => ({
            order: s.order,
            action: s.action,
            params: s.params as object,
            sharedStepId: s.sharedStepId ?? undefined,
          })),
        },
      },
      include: { steps: true },
    });

    return reply.code(201).send({ data: copy });
  });

  // PUT /api/projects/:projectId/tests/:testId/steps (全ステップ置換)
  app.put("/:projectId/tests/:testId/steps", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId, testId } = request.params as { projectId: string; testId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const body = z.object({ steps: z.array(stepSchema) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const steps = await prisma.$transaction(async (tx) => {
      await tx.testStep.deleteMany({ where: { testId } });
      await tx.test.update({ where: { id: testId }, data: { updatedAt: new Date() } });

      const created = await tx.testStep.createMany({
        data: body.data.steps.map((s) => ({
          testId,
          order: s.order,
          action: s.action,
          params: s.params as object,
          sharedStepId: s.sharedStepId,
        })),
      });

      return tx.testStep.findMany({ where: { testId }, orderBy: { order: "asc" } });
    });

    return reply.send({ data: steps });
  });

  // GET /api/projects/:projectId/shared-steps
  app.get("/:projectId/shared-steps", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canAccessProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    }

    const sharedSteps = await prisma.sharedStep.findMany({ where: { projectId } });
    return reply.send({ data: sharedSteps });
  });

  // POST /api/projects/:projectId/shared-steps
  app.post("/:projectId/shared-steps", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const userId = (request.user as { sub: string }).sub;

    if (!(await canEditProject(projectId, userId))) {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const body = z.object({ name: z.string().min(1), steps: z.array(stepSchema) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const sharedStep = await prisma.sharedStep.create({
      data: { projectId, name: body.data.name, steps: body.data.steps },
    });
    return reply.code(201).send({ data: sharedStep });
  });
};

async function canAccessProject(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: project.teamId, userId } },
  });
  return !!member;
}

async function canEditProject(projectId: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return false;
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: project.teamId, userId } },
  });
  return !!member && member.role !== "viewer";
}
