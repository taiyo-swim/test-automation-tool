import cron from "node-cron";
import { parseExpression } from "cron-parser";
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
  });

  for (const schedule of due) {
    try {
      // Read the schedule-specific test IDs (not all project tests)
      const testIds = (schedule.testIds as string[]) ?? [];
      if (testIds.length === 0) {
        // Fallback: run all active tests in the project
        const tests = await prisma.test.findMany({
          where: { projectId: schedule.projectId, status: "active" },
          select: { id: true },
        });
        testIds.push(...tests.map((t) => t.id));
      }
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
  try {
    const interval = parseExpression(cronExpression);
    return interval.next().toDate();
  } catch {
    return new Date(Date.now() + 60 * 60_000);
  }
}
