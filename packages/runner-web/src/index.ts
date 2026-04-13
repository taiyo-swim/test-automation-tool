import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { RunJobData } from "@e2e-tool/types";
import { executeRun } from "./runner.js";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const concurrency = Number(process.env.RUNNER_CONCURRENCY ?? 4);

const worker = new Worker<RunJobData>(
  "runs",
  async (job) => {
    console.log(`[runner-web] Starting job ${job.id} for run ${job.data.runId}`);
    await executeRun(job.data);
    console.log(`[runner-web] Finished job ${job.id} for run ${job.data.runId}`);
  },
  {
    connection: redis,
    concurrency,
    // Only process web platform runs
    limiter: { max: concurrency, duration: 1000 },
  }
);

worker.on("failed", (job, err) => {
  if (job) {
    console.error(`[runner-web] Job ${job.id} failed:`, err.message);
  }
});

worker.on("error", (err) => {
  console.error("[runner-web] Worker error:", err);
});

console.log(`[runner-web] Worker started with concurrency=${concurrency}`);
