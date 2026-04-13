import type { FastifyPluginAsync } from "fastify";

// Static file serving is handled by @fastify/static in app.ts
// This plugin handles any additional file-related routes.
export const fileRoutes: FastifyPluginAsync = async (_app) => {
  // Reserved for future file management endpoints (e.g., .apk uploads for Android)
};
