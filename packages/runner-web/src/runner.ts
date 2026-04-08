import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { RunJobData, TestStep } from "@e2e-tool/types";
import {
  fetchRun,
  fetchTestWithSteps,
  fetchEnvironmentVariables,
  updateRunStatus,
  createRunResult,
  updateRunResult,
  createStepResult,
  broadcastWs,
  fetchBaseline,
  saveVisualDiff,
  saveHealingSuggestion,
} from "./api-client.js";
import { executeStep } from "./actions/index.js";
import { compareWithBaseline } from "./visual.js";

export async function executeRun(jobData: RunJobData) {
  const { runId, projectId, testIds, environment } = jobData;

  await updateRunStatus(runId, "running");
  await broadcastWs(runId, { type: "run:started", runId, payload: { status: "running" } });

  const envVars = await fetchEnvironmentVariables(projectId, environment);
  let overallStatus: "passed" | "failed" = "passed";

  for (const testId of testIds) {
    const result = await runTest(runId, testId, envVars);
    if (result !== "passed") overallStatus = "failed";
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

  // Apply env variable substitution to step params
  const steps = substituteEnvVars(test.steps, envVars);

  const startTime = Date.now();
  let status: "passed" | "failed" = "passed";
  let errorMessage: string | undefined;
  const variables: Record<string, string> = { ...envVars };

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
      if (result.screenshot) {
        // Save screenshot via API
        screenshotUrl = await uploadScreenshot(runId, testId, step.id, result.screenshot);

        // Visual regression check
        if ((step.params as Record<string, unknown>).visual_regression) {
          await handleVisualRegression(
            test.projectId ?? "",
            testId,
            step.id,
            result.screenshot,
            await createStepResult(resultId, {
              runResultId: resultId,
              stepId: step.id,
              order: step.order,
              status: "passed",
              screenshotUrl,
              durationMs: Date.now() - stepStart,
              executedAt: new Date().toISOString(),
            })
          );
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

      // Capture screenshot on failure
      try {
        const failScreenshot = await page.screenshot({ fullPage: false });
        screenshotUrl = await uploadScreenshot(runId, testId, `${step.id}_fail`, failScreenshot);

        // Try self-healing selector suggestion
        await trySelfHeal(page, step, resultId);
      } catch {
        // Ignore screenshot/healing errors
      }
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

    await broadcastWs(runId, {
      type: "step:finished",
      runId,
      payload: stepResult,
    });

    if (stepStatus === "failed") break; // Stop on first failure
  }

  await browser.close();

  const duration = Date.now() - startTime;
  await updateRunResult(resultId, status, duration, errorMessage);

  await broadcastWs(runId, {
    type: "result:finished",
    runId,
    payload: { resultId, status, durationMs: duration },
  });

  return status;
}

async function launchBrowser(): Promise<Browser> {
  const browserType = process.env.BROWSER ?? "chromium";
  if (browserType === "firefox") return firefox.launch({ headless: true });
  if (browserType === "webkit") return webkit.launch({ headless: true });
  return chromium.launch({ headless: true });
}

function substituteEnvVars(steps: TestStep[], vars: Record<string, string>): TestStep[] {
  return steps.map((step) => ({
    ...step,
    params: substituteInObject(step.params, vars),
  }));
}

function substituteInObject(obj: Record<string, unknown>, vars: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = value.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? `{{${name}}}`);
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function uploadScreenshot(_runId: string, _testId: string, _stepId: string, _data: Buffer): Promise<string> {
  // Upload to API which saves to storage
  // For now return a placeholder - actual upload handled by runner API client
  return `/api/files/screenshots/${_runId}/${_stepId}.png`;
}

async function handleVisualRegression(
  projectId: string,
  testId: string,
  stepId: string,
  screenshot: Buffer,
  stepResult: { id: string }
) {
  const baseline = await fetchBaseline(projectId, testId, stepId);
  if (baseline) {
    const diffResult = await compareWithBaseline(screenshot, baseline.imagePath);
    if (diffResult) {
      await saveVisualDiff(
        stepResult.id,
        baseline.imagePath,
        diffResult.diffPath,
        diffResult.diffPercentage
      );
    }
  }
}

async function trySelfHeal(page: Page, step: TestStep, resultId: string) {
  const params = step.params as Record<string, unknown>;
  const originalSelector = params.selector as string | undefined;
  if (!originalSelector) return;

  // Simple heuristic: find elements with similar text or role
  const suggestion = await page.evaluate((sel: string) => {
    // Try to find element by text content if selector fails
    const text = sel.replace(/[#.[\]="']/g, " ").trim().split(/\s+/).filter(Boolean).join(" ");
    const elements = document.querySelectorAll("button, a, input, [role='button'], [role='link']");
    for (const el of elements) {
      const elText = el.textContent?.trim() ?? "";
      if (elText && text && elText.toLowerCase().includes(text.toLowerCase())) {
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${testId}"]`;
        const id = el.getAttribute("id");
        if (id) return `#${id}`;
        const name = el.getAttribute("name");
        if (name) return `[name="${name}"]`;
      }
    }
    return null;
  }, originalSelector);

  if (suggestion) {
    await saveHealingSuggestion(
      resultId,
      originalSelector,
      suggestion,
      0.7,
      "テキスト内容が一致する要素が見つかりました"
    );
  }
}
