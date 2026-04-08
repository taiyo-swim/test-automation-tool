"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, Play } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { TestRun } from "@e2e-tool/types";
import clsx from "clsx";

export default function RunsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["projects", projectId, "runs"],
    queryFn: () =>
      api.get(`/projects/${projectId}/runs`).then(
        (r) => r.data as { data: (TestRun & { results: { status: string }[]; triggeredBy?: { name: string } | null })[]; total: number }
      ),
    refetchInterval: 5_000,
  });

  const runs = data?.data ?? [];

  const statusIcon = (status: string) => {
    if (status === "passed") return <CheckCircle2 size={15} className="text-green-500" />;
    if (status === "failed") return <XCircle size={15} className="text-red-500" />;
    if (status === "running") return <Loader2 size={15} className="text-blue-500 animate-spin" />;
    if (status === "queued") return <Clock size={15} className="text-yellow-500" />;
    return <Clock size={15} className="text-gray-400" />;
  };

  const statusLabel = (status: string) =>
    ({ passed: "成功", failed: "失敗", running: "実行中", queued: "待機中", cancelled: "キャンセル" }[status] ?? status);

  const statusColor = (status: string) =>
    ({
      passed: "text-green-700 bg-green-50",
      failed: "text-red-700 bg-red-50",
      running: "text-blue-700 bg-blue-50",
      queued: "text-yellow-700 bg-yellow-50",
      cancelled: "text-gray-600 bg-gray-100",
    }[status] ?? "text-gray-600 bg-gray-100");

  const triggerLabel = (t: string) =>
    ({ manual: "手動", schedule: "スケジュール", api: "API", ci: "CI/CD" }[t] ?? t);

  const duration = (run: TestRun) => {
    if (!run.startedAt || !run.finishedAt) return "-";
    const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">
          実行履歴 {data && <span className="text-gray-400 font-normal">({data.total})</span>}
        </h2>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Play size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">実行履歴がありません</p>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {runs.map((run, i) => {
          const passed = run.results?.filter((r) => r.status === "passed").length ?? 0;
          const total = run.results?.length ?? 0;

          return (
            <div
              key={run.id}
              className={clsx(
                "flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors",
                i > 0 && "border-t border-gray-100"
              )}
              onClick={() => router.push(`/projects/${projectId}/runs/${run.id}`)}
            >
              <div className="flex items-center gap-2 w-24">
                {statusIcon(run.status)}
                <span className={clsx("text-xs font-medium px-1.5 py-0.5 rounded", statusColor(run.status))}>
                  {statusLabel(run.status)}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">
                  実行 #{run.id.slice(-6)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {triggerLabel(run.trigger)}
                  {run.triggeredBy && ` · ${run.triggeredBy.name}`}
                  {run.environment && ` · ${run.environment}`}
                </p>
              </div>

              <div className="text-center w-20">
                {total > 0 && (
                  <>
                    <p className="text-sm font-medium text-gray-900">{passed}/{total}</p>
                    <p className="text-xs text-gray-400">テスト</p>
                  </>
                )}
              </div>

              <div className="text-right w-16">
                <p className="text-sm text-gray-600">{duration(run)}</p>
              </div>

              <div className="text-right w-32">
                <p className="text-xs text-gray-400">
                  {new Date(run.createdAt).toLocaleDateString("ja-JP")}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(run.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
