import axios from "axios";
import type { TestStep, StepResult } from "@e2e-tool/types";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const runnerSecret = process.env.RUNNER_SECRET ?? "runner-internal-secret";

const client = axios.create({
  baseURL: apiUrl,
  headers: { "x-runner-secret": runnerSecret },
  timeout: 30_000,
});

// ── Run ──────────────────────────────────────────────────────────────

export async function updateRunStatus(runId: string, status: string, finishedAt?: Date) {
  await client.patch(`/internal/runs/${runId}`, {
    status,
    ...(finishedAt && { finishedAt: finishedAt.toISOString() }),
  });
}

// ── Results ───────────────────────────────────────────────────────────

export async function createRunResult(runId: string, testId: string): Promise<{ id: string }> {
  const { data } = await client.post(`/internal/runs/${runId}/results`, { testId });
  return data;
}

export async function updateRunResult(
  resultId: string,
  status: string,
  durationMs: number,
  errorMessage?: string
) {
  await client.patch(`/internal/results/${resultId}`, { status, durationMs, errorMessage });
}

export async function createStepResult(
  resultId: string,
  stepResult: Omit<StepResult, "id">
): Promise<StepResult> {
  const { data } = await client.post(`/internal/results/${resultId}/steps`, stepResult);
  return data;
}

// ── Tests ─────────────────────────────────────────────────────────────

export interface TestDetails {
  id: string;
  projectId: string;
  platform: string;
  name: string;
  baseUrl?: string;
  steps: TestStep[];
}

export async function fetchTestWithSteps(testId: string): Promise<TestDetails> {
  const { data } = await client.get(`/internal/tests/${testId}`);
  return data;
}

// ── Environment ───────────────────────────────────────────────────────

export async function fetchEnvironmentVariables(
  projectId: string,
  envName?: string
): Promise<Record<string, string>> {
  if (!envName) return {};
  const { data } = await client.get(`/internal/projects/${projectId}/env/${envName}`);
  return (data.variables as Record<string, string>) ?? {};
}

// ── Visual Regression ─────────────────────────────────────────────────

export interface BaselineInfo {
  id: string;
  imagePath: string;
}

export async function fetchBaseline(
  projectId: string,
  testId: string,
  stepId: string
): Promise<BaselineInfo | null> {
  try {
    const { data } = await client.get(`/internal/baselines/${projectId}/${testId}/${stepId}`);
    return data;
  } catch {
    return null;
  }
}

export async function createBaseline(
  projectId: string,
  testId: string,
  stepId: string,
  imagePath: string
): Promise<BaselineInfo> {
  const { data } = await client.post(`/internal/baselines`, {
    projectId,
    testId,
    stepId,
    imagePath,
  });
  return data;
}

export async function saveVisualDiff(
  stepResultId: string,
  baselineId: string,
  diffImagePath: string,
  diffPercentage: number
) {
  await client.post(`/internal/visual-diffs`, {
    stepResultId,
    baselineId,
    diffImagePath,
    diffPercentage,
  });
}

// ── Self-Healing ──────────────────────────────────────────────────────

export async function saveHealingSuggestion(
  stepResultId: string,
  originalSelector: string,
  suggestedSelector: string,
  confidence: number,
  reason: string
) {
  await client.post(`/internal/healing-suggestions`, {
    stepResultId,
    originalSelector,
    suggestedSelector,
    confidence,
    reason,
  });
}

// ── WebSocket Broadcast ───────────────────────────────────────────────

export async function broadcastWs(runId: string, event: object) {
  await client.post(`/internal/ws-broadcast`, { runId, event });
}

// ── Screenshot Upload ─────────────────────────────────────────────────

export async function uploadScreenshot(
  runId: string,
  stepId: string,
  data: Buffer
): Promise<string> {
  const filename = `${stepId}_${Date.now()}.png`;
  const { data: result } = await client.post(
    `/internal/screenshots/${runId}/${filename}`,
    data,
    {
      headers: {
        "Content-Type": "image/png",
        "x-runner-secret": runnerSecret,
      },
      maxBodyLength: 52_428_800,
    }
  );
  return (result as { url: string }).url;
}
