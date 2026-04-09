import cron from "node-cron";
import { prisma } from "../db.js";
import { runQueue } from "../queue/queues.js";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Check every minute for due schedules
  cron.schedule("* * * * *", async () => {
    await runDueSchedules();
  });

  console.log("[scheduler] Started — checking schedules every minute");
}

async function runDueSchedules() {
  const now = new Date();

  const due = await prisma.schedule.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
    },
    include: { project: { include: { tests: { where: { status: "active" }, select: { id: true } } } } },
  });

  for (const schedule of due) {
    try {
      // Get active test IDs for this project
      const testIds = schedule.project.tests.map((t) => t.id);
      if (testIds.length === 0) continue;

      // Create a run
      const run = await prisma.testRun.create({
        data: {
          projectId: schedule.projectId,
          trigger: "schedule",
          status: "queued",
          environment: schedule.environmentId ?? null,
        },
      });

      await runQueue.add("run", {
        runId: run.id,
        projectId: schedule.projectId,
        testIds,
        environment: schedule.environmentId ?? undefined,
      });

      // Update schedule: lastRunAt + nextRunAt
      await prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: now,
          nextRunAt: calcNextRun(schedule.cronExpression),
        },
      });

      console.log(`[scheduler] Fired schedule "${schedule.name}" → run ${run.id}`);
    } catch (err) {
      console.error(`[scheduler] Failed to fire schedule ${schedule.id}:`, err);
    }
  }
}

function calcNextRun(cronExpression: string): Date {
  // Use node-cron to find next execution time
  // Simple approximation: parse cron fields and compute next minute/hour/day
  // For production accuracy, use 'cron-parser' package
  try {
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length < 5) return new Date(Date.now() + 60_000);

    const [minute, hour] = parts;
    const now = new Date();

    if (minute === "*" && hour === "*") {
      // Every minute
      return new Date(now.getTime() + 60_000);
    }
    if (hour === "*") {
      // Every N minutes
      const m = parseInt(minute?.replace("*/", "") ?? "5");
      const interval = isNaN(m) ? 5 : m;
      return new Date(now.getTime() + interval * 60_000);
    }
    // Daily schedule — add 24h as approximation
    return new Date(now.getTime() + 24 * 60 * 60_000);
  } catch {
    return new Date(Date.now() + 60 * 60_000);
  }
}
