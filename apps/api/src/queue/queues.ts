import { Queue } from "bullmq";
import { redis } from "./redis.js";
import type { RunJobData } from "@e2e-tool/types";

export const runQueue = new Queue<RunJobData>("runs", {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});
