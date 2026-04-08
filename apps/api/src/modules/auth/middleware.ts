import type { FastifyRequest, FastifyReply } from "fastify";

export interface JwtPayload {
  sub: string;
  type: "access" | "refresh";
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
