import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";

export const teamRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/teams (自分が所属するチーム一覧)
  app.get("/", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const memberships = await prisma.teamMember.findMany({
      where: { userId },
      include: { team: true },
    });
    return reply.send({
      data: memberships.map((m) => ({ ...m.team, role: m.role })),
    });
  });

  // GET /api/teams/:teamId/members
  app.get("/:teamId/members", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { teamId } = request.params as { teamId: string };
    const userId = (request.user as { sub: string }).sub;

    await assertTeamMember(teamId, userId);

    const members = await prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } } },
    });

    return reply.send({ data: members.map((m) => ({ ...m.user, role: m.role })) });
  });

  // PATCH /api/teams/:teamId/members/:userId  (ロール変更)
  app.patch("/:teamId/members/:memberId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { teamId, memberId } = request.params as { teamId: string; memberId: string };
    const actorId = (request.user as { sub: string }).sub;
    const body = z.object({ role: z.enum(["editor", "viewer"]) }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    await assertTeamRole(teamId, actorId, ["owner"]);

    await prisma.teamMember.update({
      where: { teamId_userId: { teamId, userId: memberId } },
      data: { role: body.data.role },
    });

    return reply.send({ data: { ok: true } });
  });

  // DELETE /api/teams/:teamId/members/:userId
  app.delete("/:teamId/members/:memberId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { teamId, memberId } = request.params as { teamId: string; memberId: string };
    const actorId = (request.user as { sub: string }).sub;

    await assertTeamRole(teamId, actorId, ["owner"]);

    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId: memberId } },
    });

    return reply.code(204).send();
  });
};

async function assertTeamMember(teamId: string, userId: string) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member) throw { statusCode: 403, message: "Not a team member" };
}

async function assertTeamRole(teamId: string, userId: string, roles: string[]) {
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!member || !roles.includes(member.role)) {
    throw { statusCode: 403, message: "Insufficient permissions" };
  }
}
