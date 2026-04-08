import { chromium, firefox, webkit, type Browser, type Page } from "@playwright/test";
import type { RunJobData, TestStep } from "@e2e-tool/types";
import {
  fetchTestWithSteps,
  fetchEnvironmentVariables,
  updateRunStatus,
  createRunResult,
  updateRunResult,
  createStepResult,
  broadcastWs,
  fetchBaseline,
  createBaseline,
  saveVisualDiff,
  saveHealingSuggestion,
  uploadScreenshot,
} from "./api-client.js";
import { executeStep } from "./actions/index.js";
import { compareWithBaseline } from "./visual.js";
import path from "path";
import os from "os";
import fs from "fs/promises";

export async function executeRun(jobData: RunJobData) {
  const { runId, projectId, testIds, environment } = jobData;

  await updateRunStatus(runId, "running");
  await broadcastWs(runId, { type: "run:started", runId, payload: { status: "running" } });

  const envVars = await fetchEnvironmentVariables(projectId, environment);
  let overallStatus: "passed" | "failed" = "passed";

  for (const testId of testIds) {
    const status = await runTest(runId, testId, envVars);
    if (status !== "passed") overallStatus = "failed";
  }

  const finishedAt = new Date();
  await updateRunStatus(runId, overallStatus, finishedAt);
  await broadcastWs(runId, {
    type: "run:finished",
    runId,
    payload: { status: overallStatus, finishedAt: finishedAt.toISOString() },
  });
}

async function runTest(
  runId: string,
  testId: string,
  envVars: Record<string, string>
): Promise<"passed" | "failed"> {
  const test = await fetchTestWithSteps(testId);

  // Add BASE_URL from project config if not already set
  if (test.baseUrl && !envVars.BASE_URL) {
    envVars = { BASE_URL: test.baseUrl, ...envVars };
  }

  const resultRecord = await createRunResult(runId, testId);
  const resultId = resultRecord.id;

  await broadcastWs(runId, {
    type: "result:started",
    runId,
    payload: { resultId, testId, testName: test.name },
  });

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const steps = substituteEnvVars(test.steps, envVars);
  const variables: Record<string, string> = { ...envVars };

  const startTime = Date.now();
  let status: "passed" | "failed" = "passed";
  let errorMessage: string | undefined;

  for (const step of steps) {
    const stepStart = Date.now();
    let stepStatus: "passed" | "failed" = "passed";
    let stepLog = "";
    let screenshotUrl: string | undefined;

    await broadcastWs(runId, {
      type: "step:started",
      runId,
      payload: { resultId, stepOrder: step.order, action: step.action },
    });

    try {
      const result = await executeStep(page, step, variables);

      // Upload screenshot if captured
      if (result.screenshot) {
        screenshotUrl = await uploadScreenshot(runId, step.id, result.screenshot);

        // Visual regression
        if ((step.params as Record<string, unknown>).visual_regression) {
          const baseline = await fetchBaseline(test.projectId, testId, step.id);
          if (baseline) {
            // Compare with existing baseline
            const tempPath = path.join(os.tmpdir(), `baseline_${step.id}.png`);
            // Download baseline for comparison — use local path if available
            const diffResult = await compareWithBaseline(result.screenshot, baseline.imagePath.startsWith("/api/files/")
              ? baseline.imagePath.replace("/api/files/", (process.env.STORAGE_LOCAL_PATH ?? "./storage") + "/")
              : baseline.imagePath);

            if (diffResult) {
              // Upload diff image
              const diffBuffer = await fs.readFile(diffResult.diffPath).catch(() => null);
              let diffUrl = diffResult.diffPath;
              if (diffBuffer) {
                diffUrl = await uploadScreenshot(runId, `${step.id}_diff`, diffBuffer);
              }

              // Get the step result ID after creation below
              const sr = await createStepResult(resultId, {
                runResultId: resultId,
                stepId: step.id,
                order: step.order,
                status: stepStatus,
                screenshotUrl,
                logText: result.log ?? `✓ ${step.action}`,
                durationMs: Date.now() - stepStart,
                executedAt: new Date().toISOString(),
              });

              await saveVisualDiff(sr.id, baseline.id, diffUrl, diffResult.diffPercentage);

              await broadcastWs(runId, { type: "step:finished", runId, payload: sr });
              continue; // skip duplicate createStepResult below
            }
          } else {
            // No baseline yet — create one
            await createBaseline(test.projectId, testId, step.id, screenshotUrl ?? "");
          }
        }
      }

      if (result.extractedVar) {
        variables[result.extractedVar.name] = result.extractedVar.value;
      }

      stepLog = result.log ?? `✓ ${step.action}`;
    } catch (err) {
      stepStatus = "failed";
      status = "failed";
      const errMsg = err instanceof Error ? err.message : String(err);
      stepLog = `✗ ${step.action}: ${errMsg}`;
      errorMessage = errMsg;

      // Capture failure screenshot
      try {
        const failShot = await page.screenshot({ fullPage: false });
        screenshotUrl = await uploadScreenshot(runId, `${step.id}_fail`, failShot);
      } catch {
        // Ignore screenshot errors
      }

      // Try self-healing
      await trySelfHeal(page, step, resultId);
    }

    const stepDuration = Date.now() - stepStart;
    const stepResult = await createStepResult(resultId, {
      runResultId: resultId,
      stepId: step.id,
      order: step.order,
      status: stepStatus,
      screenshotUrl,
      logText: stepLog,
      durationMs: stepDuration,
      executedAt: new Date().toISOString(),
    });

    await broadcastWs(runId, { type: "step:finished", runId, payload: stepResult });

    if (stepStatus === "failed") break;
  }

  await browser.close();

  const durationMs = Date.now() - startTime;
  await updateRunResult(resultId, status, durationMs, errorMessage);

  await broadcastWs(runId, {
    type: "result:finished",
    runId,
    payload: { resultId, status, durationMs },
  });

  return status;
}

async function launchBrowser(): Promise<Browser> {
  const browserType = process.env.BROWSER ?? "chromium";
  const options = { headless: true };
  if (browserType === "firefox") return firefox.launch(options);
  if (browserType === "webkit") return webkit.launch(options);
  return chromium.launch(options);
}

function substituteEnvVars(steps: TestStep[], vars: Record<string, string>): TestStep[] {
  return steps.map((step) => ({
    ...step,
    params: substituteInObject(step.params as Record<string, unknown>, vars),
  }));
}

function substituteInObject(
  obj: Record<string, unknown>,
  vars: Record<string, string>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === "string"
        ? v.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? `{{${name}}}`)
        : v,
    ])
  );
}

async function trySelfHeal(page: Page, step: TestStep, resultId: string) {
  const params = step.params as Record<string, unknown>;
  const originalSelector = params.selector as string | undefined;
  if (!originalSelector) return;

  try {
    const suggestion = await page.evaluate((sel: string) => {
      const keywords = sel.replace(/[#.\[\]="']/g, " ").trim().split(/\s+/).filter(Boolean);
      if (keywords.length === 0) return null;

      const candidates = Array.from(
        document.querySelectorAll("button, a, input, select, textarea, [role='button'], [role='link'], [role='menuitem']")
      );

      for (const el of candidates) {
        const text = (el.textContent?.trim() ?? "").toLowerCase();
        const matches = keywords.some((kw) => text.includes(kw.toLowerCase()));

        if (matches) {
          const testId = el.getAttribute("data-testid");
          if (testId) return `[data-testid="${testId}"]`;
          const id = el.id;
          if (id) return `#${id}`;
          const name = el.getAttribute("name");
          if (name) return `[name="${name}"]`;
          const ariaLabel = el.getAttribute("aria-label");
          if (ariaLabel) return `[aria-label="${ariaLabel}"]`;
        }
      }
      return null;
    }, originalSelector);

    if (suggestion) {
      await saveHealingSuggestion(
        resultId,
        originalSelector,
        suggestion,
        0.75,
        "テキスト・役割が一致する要素を発見しました"
      );
    }
  } catch {
    // Self-healing is best-effort
  }
}
