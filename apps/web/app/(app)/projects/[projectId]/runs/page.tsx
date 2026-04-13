"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, Play, Zap, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { TestRun } from "@e2e-tool/types";
import clsx from "clsx";

const STATUS_OPTIONS = [
  { value: "", label: "すべて" },
  { value: "passed", label: "成功" },
  { value: "failed", label: "失敗" },
  { value: "running", label: "実行中" },
  { value: "queued", label: "待機中" },
  { value: "cancelled", label: "キャンセル" },
] as const;

const PAGE_SIZE = 20;

export default function RunsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["projects", projectId, "runs", statusFilter, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      return api
        .get(`/projects/${projectId}/runs?${params}`)
        .then(
          (r) =>
            r.data as {
              data: (TestRun & {
                results: { status: string }[];
                triggeredBy?: { name: string } | null;
                parallelism: number;
              })[];
              total: number;
              page: number;
              pageSize: number;
            }
        );
    },
    refetchInterval: 5_000,
  });

  const runs = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const statusIcon = (status: string) => {
    if (status === "passed") return <CheckCircle2 size={15} className="text-green-500" />;
    if (status === "failed") return <XCircle size={15} className="text-red-500" />;
    if (status === "running") return <Loader2 size={15} className="text-blue-500 animate-spin" />;
    if (status === "queued") return <Clock size={15} className="text-yellow-500" />;
    return <Clock size={15} className="text-gray-400" />;
  };

  const statusLabel = (s: string) =>
    ({ passed: "成功", failed: "失敗", running: "実行中", queued: "待機中", cancelled: "キャンセル" }[s] ?? s);

  const statusColor = (s: string) =>
    ({
      passed: "text-green-700 bg-green-50",
      failed: "text-red-700 bg-red-50",
      running: "text-blue-700 bg-blue-50",
      queued: "text-yellow-700 bg-yellow-50",
      cancelled: "text-gray-600 bg-gray-100",
    }[s] ?? "text-gray-600 bg-gray-100");

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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          実行履歴 {data && <span className="text-gray-400 font-normal">({total})</span>}
        </h2>

        {/* Status filter */}
        <div className="flex gap-1">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={clsx(
                "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                statusFilter === opt.value
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        </div>
      )}

      {!isLoading && runs.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Play size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">
            {statusFilter ? `「${statusLabel(statusFilter)}」の実行履歴がありません` : "実行履歴がありません"}
          </p>
        </div>
      )}

      {runs.length > 0 && (
        <>
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
                  <div className="flex items-center gap-2 w-24 shrink-0">
                    {statusIcon(run.status)}
                    <span className={clsx("text-xs font-medium px-1.5 py-0.5 rounded", statusColor(run.status))}>
                      {statusLabel(run.status)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">実行 #{run.id.slice(-6)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {triggerLabel(run.trigger)}
                      {run.triggeredBy && ` · ${run.triggeredBy.name}`}
                      {run.environment && ` · ${run.environment}`}
                    </p>
                  </div>

                  {/* Parallelism badge */}
                  {run.parallelism > 1 && (
                    <span className="flex items-center gap-0.5 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      <Zap size={10} />
                      ×{run.parallelism}
                    </span>
                  )}

                  <div className="text-center w-20 shrink-0">
                    {total > 0 && (
                      <>
                        <p className="text-sm font-medium text-gray-900">
                          <span className="text-green-600">{passed}</span>
                          <span className="text-gray-300">/</span>
                          {total}
                        </p>
                        <p className="text-xs text-gray-400">テスト</p>
                      </>
                    )}
                  </div>

                  <div className="text-right w-16 shrink-0">
                    <p className="text-sm text-gray-600">{duration(run)}</p>
                  </div>

                  <div className="text-right w-32 shrink-0">
                    <p className="text-xs text-gray-400">
                      {new Date(run.createdAt).toLocaleDateString("ja-JP")}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(run.createdAt).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-400">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data?.total ?? 0)} / {data?.total ?? 0} 件
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-gray-600 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
