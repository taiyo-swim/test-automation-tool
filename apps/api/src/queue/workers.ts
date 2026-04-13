import { Worker } from "bullmq";
import { redis } from "./redis.js";
import { prisma } from "../db.js";
import { broadcast } from "../websocket/handler.js";
import type { RunJobData } from "@e2e-tool/types";

export async function startWorkers() {
  // This API worker only handles status updates from external runners.
  // The actual test execution happens in runner-web / runner-api packages.
  // Here we just update run status if a run is queued but no runner picks it up.

  const worker = new Worker<RunJobData>(
    "runs",
    async (job) => {
      const { runId } = job.data;

      // Mark as running
      await prisma.testRun.update({
        where: { id: runId },
        data: { status: "running", startedAt: new Date() },
      });

      broadcast(runId, {
        type: "run:started",
        runId,
        payload: { status: "running" },
      });

      // The actual execution is performed by runner-web or runner-api workers
      // which also subscribe to this queue. This worker acts as a fallback
      // to detect stuck jobs.
      // In practice, runner workers process jobs directly and update DB.
    },
    {
      connection: redis,
      // Don't auto-process — runners do the actual work
      autorun: false,
    }
  );

  worker.on("failed", (job, err) => {
    if (job) {
      console.error(`Job ${job.id} failed:`, err);
    }
  });

  console.log("BullMQ workers initialized");
}
