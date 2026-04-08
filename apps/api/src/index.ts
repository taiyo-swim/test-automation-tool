import { buildApp } from "./app.js";

const app = await buildApp();

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4000);

try {
  await app.listen({ host, port });
  console.log(`API server listening on http://${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
