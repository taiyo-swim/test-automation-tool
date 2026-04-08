import axios from "axios";
import type { TestStep, StepResult } from "@e2e-tool/types";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const runnerSecret = process.env.RUNNER_SECRET ?? "runner-internal-secret";

const client = axios.create({
  baseURL: apiUrl,
  headers: { "x-runner-secret": runnerSecret },
  timeout: 30_000,
});

export interface RunDetails {
  id: string;
  projectId: string;
  status: string;
  environment?: string;
  results: Array<{
    id: string;
    testId: string;
    status: string;
  }>;
}

export interface TestDetails {
  id: string;
  projectId: string;
  platform: string;
  name: string;
  steps: TestStep[];
}

export interface EnvironmentDetails {
  variables: Record<string, string>;
}

export async function fetchRun(runId: string): Promise<RunDetails> {
  const { data } = await client.get(`/internal/runs/${runId}`);
  return data;
}

export async function fetchTestWithSteps(testId: string): Promise<TestDetails> {
  const { data } = await client.get(`/internal/tests/${testId}`);
  return data;
}

export async function fetchEnvironmentVariables(projectId: string, envName?: string): Promise<Record<string, string>> {
  if (!envName) return {};
  const { data } = await client.get(`/internal/projects/${projectId}/env/${envName}`);
  return data.variables ?? {};
}

export async function fetchBaseline(projectId: string, testId: string, stepId: string): Promise<{ imagePath: string } | null> {
  try {
    const { data } = await client.get(`/internal/baselines/${projectId}/${testId}/${stepId}`);
    return data;
  } catch {
    return null;
  }
}

export async function updateRunStatus(runId: string, status: string, finishedAt?: Date) {
  await client.patch(`/internal/runs/${runId}`, { status, finishedAt });
}

export async function createRunResult(runId: string, testId: string) {
  const { data } = await client.post(`/internal/runs/${runId}/results`, { testId });
  return data as { id: string };
}

export async function updateRunResult(resultId: string, status: string, durationMs: number, errorMessage?: string) {
  await client.patch(`/internal/results/${resultId}`, { status, durationMs, errorMessage });
}

export async function createStepResult(resultId: string, stepResult: Omit<StepResult, "id">) {
  const { data } = await client.post(`/internal/results/${resultId}/steps`, stepResult);
  return data as StepResult;
}

export async function saveVisualDiff(
  stepResultId: string,
  baselineId: string,
  diffImagePath: string,
  diffPercentage: number
) {
  await client.post(`/internal/visual-diffs`, { stepResultId, baselineId, diffImagePath, diffPercentage });
}

export async function saveHealingSuggestion(
  stepResultId: string,
  originalSelector: string,
  suggestedSelector: string,
  confidence: number,
  reason: string
) {
  await client.post(`/internal/healing-suggestions`, {
    stepResultId, originalSelector, suggestedSelector, confidence, reason,
  });
}

export async function broadcastWs(runId: string, event: object) {
  await client.post(`/internal/ws-broadcast`, { runId, event });
}
