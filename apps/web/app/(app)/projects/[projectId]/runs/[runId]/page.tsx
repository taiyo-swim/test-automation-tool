"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../../../../../lib/api";
import type { TestRun, TestRunResult, StepResult } from "@e2e-tool/types";
import { VisualDiffViewer } from "../../../../../../components/run/visual-diff-viewer";
import { HealingSuggestionCard } from "../../../../../../components/run/healing-suggestion-card";
import clsx from "clsx";

interface VisualDiff {
  id: string;
  stepResultId: string;
  baselineId: string;
  diffImageUrl?: string;
  diffPercentage: number;
  status: "pending" | "approved" | "rejected";
}

interface HealingSuggestion {
  id: string;
  originalSelector: string;
  suggestedSelector: string;
  confidence: number;
  reason: string;
  status: "pending" | "accepted" | "rejected";
}

type ExtendedStepResult = StepResult & {
  visualDiff?: VisualDiff;
  healingSuggestion?: HealingSuggestion;
};

type RunDetail = TestRun & {
  results: (TestRunResult & {
    test: { id: string; name: string };
    stepResults: ExtendedStepResult[];
  })[];
  triggeredBy?: { id: string; name: string } | null;
};

export default function RunDetailPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const { data: run, isLoading } = useQuery({
    queryKey: ["runs", runId],
    queryFn: () =>
      api.get(`/projects/${projectId}/runs/${runId}`).then((r) => r.data.data as RunDetail),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "queued" || s === "running" ? 2000 : false;
    },
  });

  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws?runId=${runId}`);
    ws.onmessage = () => qc.invalidateQueries({ queryKey: ["runs", runId] });
    wsRef.current = ws;
    return () => ws.close();
  }, [run?.status, runId, qc]);

  if (isLoading) return <LoadingSpinner />;
  if (!run) return null;

  const passed = run.results.filter((r) => r.status === "passed").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  const total = run.results.length;
  const pendingDiffs = run.results.flatMap((r) =>
    r.stepResults.filter((s) => s.visualDiff?.status === "pending")
  ).length;
  const pendingHealings = run.results.flatMap((r) =>
    r.stepResults.filter((s) => s.healingSuggestion?.status === "pending")
  ).length;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.push(`/projects/${projectId}/runs`)} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded">
          <ArrowLeft size={16} />
        </button>
        <StatusIcon status={run.status} size={18} />
        <h1 className="text-base font-semibold text-gray-900">実行 #{run.id.slice(-6)}</h1>
      </div>

      {/* Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="ステータス">
            <StatusBadge status={run.status} />
          </Stat>
          <Stat label="テスト結果">
            <span className="text-sm font-medium">
              <span className="text-green-600">{passed}</span>
              <span className="text-gray-400"> / </span>
              <span className="text-red-600">{failed}</span>
              <span className="text-gray-400"> / {total}</span>
            </span>
          </Stat>
          <Stat label="実行方法">
            <span className="text-sm text-gray-700">
              {{ manual: "手動", schedule: "スケジュール", api: "API", ci: "CI/CD" }[run.trigger] ?? run.trigger}
            </span>
          </Stat>
          <Stat label="実行日時">
            <span className="text-sm text-gray-700">{new Date(run.createdAt).toLocaleString("ja-JP")}</span>
          </Stat>
        </div>

        {/* Badges for pending reviews */}
        {(pendingDiffs > 0 || pendingHealings > 0) && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            {pendingDiffs > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">
                ⚠ ビジュアル差分 {pendingDiffs}件 — レビュー待ち
              </span>
            )}
            {pendingHealings > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
                🔧 セルフヒーリング {pendingHealings}件 — 確認待ち
              </span>
            )}
          </div>
        )}
      </div>

      {/* Test results */}
      <div className="space-y-3">
        {run.results.map((result) => (
          <TestResultCard
            key={result.id}
            result={result}
            runId={runId}
            projectId={projectId}
          />
        ))}
      </div>
    </div>
  );
}

function TestResultCard({
  result,
  runId,
  projectId,
}: {
  result: RunDetail["results"][0];
  runId: string;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(result.status === "failed");
  const duration = result.durationMs != null ? `${(result.durationMs / 1000).toFixed(2)}s` : "-";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <StatusIcon status={result.status} />
        <span className="flex-1 text-sm font-medium text-gray-900">{result.test.name}</span>
        <span className="text-xs text-gray-400">{duration}</span>
        {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {result.stepResults.length === 0 && (
            <p className="text-xs text-gray-400 px-5 py-3">ステップ結果がありません</p>
          )}
          {result.stepResults.map((step) => (
            <StepResultRow key={step.id} step={step} runId={runId} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepResultRow({
  step,
  runId,
  projectId,
}: {
  step: ExtendedStepResult;
  runId: string;
  projectId: string;
}) {
  const [showDetail, setShowDetail] = useState(
    step.status === "failed" || !!step.visualDiff || !!step.healingSuggestion
  );

  return (
    <div className={clsx("px-5 py-2.5", step.status === "failed" && "bg-red-50/50")}>
      <div
        className="flex items-center gap-3 cursor-pointer"
        onClick={() => setShowDetail((p) => !p)}
      >
        <StatusIcon status={step.status} size={13} />
        <span className="text-xs font-mono text-gray-400 w-5 shrink-0">{step.order + 1}</span>
        <span className="text-sm text-gray-800 flex-1">{step.logText ?? `Step ${step.order + 1}`}</span>

        {step.visualDiff && (
          <span
            className={clsx(
              "text-xs px-1.5 py-0.5 rounded-full font-medium",
              step.visualDiff.status === "pending" && "bg-amber-100 text-amber-700",
              step.visualDiff.status === "approved" && "bg-green-100 text-green-700",
              step.visualDiff.status === "rejected" && "bg-gray-100 text-gray-500"
            )}
          >
            差分 {step.visualDiff.diffPercentage.toFixed(1)}%
          </span>
        )}

        {step.healingSuggestion?.status === "pending" && (
          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
            修正候補
          </span>
        )}

        <span className="text-xs text-gray-400 shrink-0">{step.durationMs != null ? `${step.durationMs}ms` : ""}</span>
      </div>

      {showDetail && (
        <div className="mt-3 space-y-3 pl-8">
          {/* Screenshot */}
          {step.screenshotUrl && !step.visualDiff && (
            <img
              src={step.screenshotUrl}
              alt="screenshot"
              className="rounded border border-gray-200 max-w-lg"
            />
          )}

          {/* Visual diff viewer */}
          {step.visualDiff && (
            <VisualDiffViewer
              diff={step.visualDiff}
              screenshotUrl={step.screenshotUrl}
              runId={runId}
              projectId={projectId}
            />
          )}

          {/* Self-healing suggestion */}
          {step.healingSuggestion && (
            <HealingSuggestionCard suggestion={step.healingSuggestion} runId={runId} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────

function StatusIcon({ status, size = 15 }: { status: string; size?: number }) {
  if (status === "passed") return <CheckCircle2 size={size} className="text-green-500 shrink-0" />;
  if (status === "failed") return <XCircle size={size} className="text-red-500 shrink-0" />;
  if (status === "running") return <Loader2 size={size} className="text-blue-500 animate-spin shrink-0" />;
  return <Clock size={size} className="text-yellow-500 shrink-0" />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    passed: "text-green-700 bg-green-50",
    failed: "text-red-700 bg-red-50",
    running: "text-blue-700 bg-blue-50",
    queued: "text-yellow-700 bg-yellow-50",
    cancelled: "text-gray-600 bg-gray-100",
  };
  const label: Record<string, string> = {
    passed: "成功", failed: "失敗", running: "実行中", queued: "待機中", cancelled: "キャンセル",
  };
  return (
    <span className={clsx("text-sm font-medium px-2 py-0.5 rounded", map[status] ?? "text-gray-600 bg-gray-100")}>
      {label[status] ?? status}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
