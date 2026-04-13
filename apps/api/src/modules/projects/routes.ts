import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";

const projectSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["web", "android", "api"]),
  teamId: z.string(),
  baseUrl: z.string().url().optional(),
  appPackage: z.string().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/projects
  app.get("/", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const memberships = await prisma.teamMember.findMany({ where: { userId } });
    const teamIds = memberships.map((m) => m.teamId);

    const projects = await prisma.project.findMany({
      where: { teamId: { in: teamIds } },
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ data: projects });
  });

  // POST /api/projects
  app.post("/", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const body = projectSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    // Verify user is owner/editor of the team
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: body.data.teamId, userId } },
    });
    if (!member || member.role === "viewer") {
      return reply.code(403).send({ error: "Forbidden", message: "Insufficient permissions", statusCode: 403 });
    }

    const project = await prisma.project.create({ data: body.data });

    // Create default environments
    await prisma.environment.createMany({
      data: [
        { projectId: project.id, name: "development", variables: {} },
        { projectId: project.id, name: "staging", variables: {} },
        { projectId: project.id, name: "production", variables: {} },
      ],
    });

    return reply.code(201).send({ data: project });
  });

  // GET /api/projects/:id
  app.get("/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    return reply.send({ data: project });
  });

  // PATCH /api/projects/:id
  app.patch("/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    const body = projectSchema.partial().omit({ teamId: true }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const updated = await prisma.project.update({ where: { id }, data: body.data });
    return reply.send({ data: updated });
  });

  // DELETE /api/projects/:id
  app.delete("/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    await prisma.project.delete({ where: { id } });
    return reply.code(204).send();
  });

  // GET /api/projects/:id/environments
  app.get("/:id/environments", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    const envs = await prisma.environment.findMany({ where: { projectId: id } });
    // Mask variable values partially for display
    return reply.send({ data: envs });
  });

  // PATCH /api/projects/:id/environments/:envId
  app.patch("/:id/environments/:envId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id, envId } = request.params as { id: string; envId: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    const body = z.object({ variables: z.record(z.string()) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const env = await prisma.environment.update({
      where: { id: envId },
      data: { variables: body.data.variables },
    });
    return reply.send({ data: env });
  });

  // GET /api/projects/:id/api-tokens
  app.get("/:id/api-tokens", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    const tokens = await prisma.apiToken.findMany({
      where: { projectId: id },
      select: { id: true, name: true, lastUsedAt: true, createdAt: true },
    });
    return reply.send({ data: tokens });
  });

  // POST /api/projects/:id/api-tokens
  app.post("/:id/api-tokens", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    const body = z.object({ name: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const { randomBytes, createHash } = await import("crypto");
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");

    await prisma.apiToken.create({
      data: { projectId: id, name: body.data.name, tokenHash },
    });

    // Return the raw token only once
    return reply.code(201).send({ data: { token: raw, name: body.data.name } });
  });

  // DELETE /api/projects/:id/api-tokens/:tokenId
  app.delete("/:id/api-tokens/:tokenId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id, tokenId } = request.params as { id: string; tokenId: string };
    const userId = (request.user as { sub: string }).sub;

    const project = await getProjectOrFail(id, userId, reply);
    if (!project) return;

    await prisma.apiToken.delete({ where: { id: tokenId, projectId: id } });
    return reply.code(204).send();
  });
};

async function getProjectOrFail(
  projectId: string,
  userId: string,
  reply: { code: (n: number) => { send: (data: unknown) => void } }
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    reply.code(404).send({ error: "Not Found", message: "Project not found", statusCode: 404 });
    return null;
  }

  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: project.teamId, userId } },
  });
  if (!member) {
    reply.code(403).send({ error: "Forbidden", message: "Access denied", statusCode: 403 });
    return null;
  }

  return project;
}
