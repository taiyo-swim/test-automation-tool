import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../../db.js";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/signup
  app.post("/signup", async (request, reply) => {
    const body = signupSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const { email, password, name } = body.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "Conflict", message: "Email already in use", statusCode: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { email, name, passwordHash },
      });
      // Create a personal team
      const team = await tx.team.create({
        data: { name: `${name}'s Team` },
      });
      await tx.teamMember.create({
        data: { teamId: team.id, userId: newUser.id, role: "owner" },
      });
      return newUser;
    });

    const tokens = generateTokens(app, user.id);

    return reply.code(201).send({
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      },
    });
  });

  // POST /api/auth/login
  app.post("/login", async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Bad Request", message: body.error.message, statusCode: 400 });
    }

    const { email, password } = body.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid email or password", statusCode: 401 });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid email or password", statusCode: 401 });
    }

    const tokens = generateTokens(app, user.id);

    return reply.send({
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      },
    });
  });

  // POST /api/auth/refresh
  app.post("/refresh", async (request, reply) => {
    const body = (request.body ?? {}) as { refreshToken?: string };
    if (!body.refreshToken) {
      return reply.code(400).send({ error: "Bad Request", message: "refreshToken required", statusCode: 400 });
    }

    try {
      const payload = app.jwt.verify<{ sub: string; type: string }>(body.refreshToken);
      if (payload.type !== "refresh") throw new Error("Not a refresh token");

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new Error("User not found");

      const tokens = generateTokens(app, user.id);
      return reply.send({ data: tokens });
    } catch {
      return reply.code(401).send({ error: "Unauthorized", message: "Invalid refresh token", statusCode: 401 });
    }
  });

  // GET /api/auth/me
  app.get("/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const payload = request.user as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return reply.code(404).send({ error: "Not Found", message: "User not found", statusCode: 404 });
    }
    return reply.send({
      data: { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl, createdAt: user.createdAt },
    });
  });

  // POST /api/auth/logout (client-side token discard; stateless JWT)
  app.post("/logout", async (_request, reply) => {
    return reply.send({ data: { ok: true } });
  });
};

function generateTokens(app: { jwt: { sign: (payload: object, options: { expiresIn: string }) => string } }, userId: string) {
  const accessToken = app.jwt.sign(
    { sub: userId, type: "access" },
    { expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" }
  );
  const refreshToken = app.jwt.sign(
    { sub: userId, type: "refresh" },
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d" }
  );
  return { accessToken, refreshToken };
}
