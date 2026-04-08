"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../../../lib/api";
import type { TestRun, TestRunResult, StepResult } from "@e2e-tool/types";
import clsx from "clsx";

type RunDetail = TestRun & {
  results: (TestRunResult & {
    test: { id: string; name: string };
    stepResults: StepResult[];
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
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 2000 : false;
    },
  });

  // WebSocket for real-time log streaming
  useEffect(() => {
    if (!run || (run.status !== "queued" && run.status !== "running")) return;

    const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws?runId=${runId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "run:finished" || data.type === "step:finished" || data.type === "result:finished") {
        qc.invalidateQueries({ queryKey: ["runs", runId] });
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [run?.status, runId, qc]);

  const statusIcon = (status: string, size = 15) => {
    if (status === "passed") return <CheckCircle2 size={size} className="text-green-500" />;
    if (status === "failed") return <XCircle size={size} className="text-red-500" />;
    if (status === "running") return <Loader2 size={size} className="text-blue-500 animate-spin" />;
    return <Clock size={size} className="text-yellow-500" />;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!run) return null;

  const passed = run.results.filter((r) => r.status === "passed").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  const total = run.results.length;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => router.push(`/projects/${projectId}/runs`)}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          {statusIcon(run.status, 18)}
          <h1 className="text-base font-semibold text-gray-900">
            実行 #{run.id.slice(-6)}
          </h1>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5">
        <div className="grid grid-cols-4 gap-4">
          <Stat label="ステータス">
            <span
              className={clsx(
                "text-sm font-medium px-2 py-0.5 rounded",
                run.status === "passed" && "text-green-700 bg-green-50",
                run.status === "failed" && "text-red-700 bg-red-50",
                run.status === "running" && "text-blue-700 bg-blue-50",
                run.status === "queued" && "text-yellow-700 bg-yellow-50"
              )}
            >
              {{ passed: "成功", failed: "失敗", running: "実行中", queued: "待機中", cancelled: "キャンセル" }[run.status] ?? run.status}
            </span>
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
            <span className="text-sm text-gray-700">
              {run.createdAt ? new Date(run.createdAt).toLocaleString("ja-JP") : "-"}
            </span>
          </Stat>
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-3">
        {run.results.map((result) => (
          <TestResultCard key={result.id} result={result} statusIcon={statusIcon} />
        ))}
      </div>
    </div>
  );
}

function TestResultCard({
  result,
  statusIcon,
}: {
  result: RunDetail["results"][0];
  statusIcon: (status: string, size?: number) => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(result.status === "failed");

  const duration =
    result.durationMs != null ? `${(result.durationMs / 1000).toFixed(2)}s` : "-";

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        {statusIcon(result.status)}
        <span className="flex-1 text-sm font-medium text-gray-900">{result.test.name}</span>
        <span className="text-xs text-gray-400">{duration}</span>
        {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {result.stepResults.length === 0 && (
            <p className="text-xs text-gray-400 px-5 py-3">ステップ結果がありません</p>
          )}
          {result.stepResults.map((step) => (
            <StepResultRow key={step.id} step={step} statusIcon={statusIcon} />
          ))}
        </div>
      )}
    </div>
  );
}

function StepResultRow({
  step,
  statusIcon,
}: {
  step: StepResult;
  statusIcon: (status: string, size?: number) => React.ReactNode;
}) {
  const [showScreenshot, setShowScreenshot] = useState(false);

  return (
    <div
      className={clsx(
        "flex items-start gap-3 px-5 py-2.5 border-b border-gray-50 last:border-b-0",
        step.status === "failed" && "bg-red-50/50"
      )}
    >
      <div className="mt-0.5">{statusIcon(step.status, 13)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 w-5">{step.order + 1}</span>
          <span className="text-sm text-gray-800">{step.logText ?? `Step ${step.order + 1}`}</span>
        </div>

        {step.screenshotUrl && (
          <button
            onClick={() => setShowScreenshot((p) => !p)}
            className="text-xs text-primary-600 hover:underline mt-1 ml-7"
          >
            {showScreenshot ? "スクリーンショットを隠す" : "スクリーンショットを表示"}
          </button>
        )}

        {showScreenshot && step.screenshotUrl && (
          <img
            src={step.screenshotUrl}
            alt="screenshot"
            className="mt-2 ml-7 rounded border border-gray-200 max-w-lg"
          />
        )}
      </div>

      <span className="text-xs text-gray-400 shrink-0">
        {step.durationMs != null ? `${step.durationMs}ms` : ""}
      </span>
    </div>
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
