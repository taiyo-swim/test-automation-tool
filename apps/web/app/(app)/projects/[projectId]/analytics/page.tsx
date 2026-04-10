"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, CheckCircle2, XCircle, Clock, BarChart2 } from "lucide-react";
import { api } from "../../../../../lib/api";
import clsx from "clsx";

interface FlakyTest {
  testId: string;
  testName: string;
  passed: number;
  failed: number;
  total: number;
  failRate: number;
}

interface TrendPoint {
  date: string;
  passRate: number | null;
  runs: number;
  avgDurationMs: number | null;
}

interface SlowestTest {
  testId: string;
  testName: string;
  avgDurationMs: number;
  runCount: number;
  tags: string[];
}

type AnalyticsTab = "trends" | "flaky" | "slowest";

export default function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<AnalyticsTab>("trends");
  const [days, setDays] = useState(30);

  const { data: trends = [], isLoading: trendsLoading } = useQuery({
    queryKey: ["analytics", "trends", projectId, days],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/analytics/trends?days=${days}`)
        .then((r) => r.data.data as TrendPoint[]),
    enabled: tab === "trends",
  });

  const { data: flaky = [], isLoading: flakyLoading } = useQuery({
    queryKey: ["analytics", "flaky", projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/analytics/flaky`).then((r) => r.data.data as FlakyTest[]),
    enabled: tab === "flaky",
  });

  const { data: slowest = [], isLoading: slowestLoading } = useQuery({
    queryKey: ["analytics", "slowest", projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/analytics/slowest`).then((r) => r.data.data as SlowestTest[]),
    enabled: tab === "slowest",
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-5">
        <h1 className="text-base font-semibold text-gray-900">テスト分析</h1>
        <p className="text-xs text-gray-500 mt-0.5">テストの安定性・パフォーマンスを可視化</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(
          [
            { key: "trends" as const, label: "トレンド", icon: TrendingUp },
            { key: "flaky" as const, label: "不安定テスト", icon: AlertTriangle },
            { key: "slowest" as const, label: "低速テスト", icon: Clock },
          ]
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Trends Tab ─────────────────────────────────────────────────── */}
      {tab === "trends" && (
        <TrendsTab trends={trends} loading={trendsLoading} days={days} setDays={setDays} />
      )}

      {/* ── Flaky Tab ──────────────────────────────────────────────────── */}
      {tab === "flaky" && <FlakyTab flaky={flaky} loading={flakyLoading} />}

      {/* ── Slowest Tab ────────────────────────────────────────────────── */}
      {tab === "slowest" && <SlowestTab slowest={slowest} loading={slowestLoading} />}
    </div>
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────

function TrendsTab({
  trends,
  loading,
  days,
  setDays,
}: {
  trends: TrendPoint[];
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
}) {
  const [metric, setMetric] = useState<"passRate" | "avgDurationMs">("passRate");

  const maxVal =
    metric === "passRate"
      ? 100
      : Math.max(...trends.map((t) => t.avgDurationMs ?? 0), 1);

  const validPoints = trends.filter((t) => t[metric] != null);
  const avgVal =
    validPoints.length > 0
      ? Math.round(validPoints.reduce((s, t) => s + (t[metric] ?? 0), 0) / validPoints.length)
      : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["passRate", "avgDurationMs"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={clsx(
                "text-xs px-2.5 py-1 rounded-lg border transition-colors",
                metric === m
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {m === "passRate" ? "合格率 (%)" : "平均時間 (ms)"}
            </button>
          ))}
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
        >
          <option value={7}>7日間</option>
          <option value={14}>14日間</option>
          <option value={30}>30日間</option>
          <option value={90}>90日間</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : trends.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <BarChart2 size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-500">データがありません</p>
          <p className="text-xs text-gray-400 mt-1">テストを実行するとグラフが表示されます</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          {/* Summary */}
          {avgVal != null && (
            <div className="mb-4">
              <p className="text-xs text-gray-500">期間平均</p>
              <p className="text-2xl font-semibold text-gray-900">
                {metric === "passRate" ? `${avgVal}%` : `${(avgVal / 1000).toFixed(1)}s`}
              </p>
            </div>
          )}

          {/* Bar chart */}
          <div className="flex items-end gap-1 h-40 overflow-x-auto">
            {trends.map((point) => {
              const val = point[metric];
              const barPct = val != null ? (val / maxVal) * 100 : 0;
              const color =
                metric === "passRate"
                  ? val == null
                    ? "bg-gray-100"
                    : val >= 90
                    ? "bg-green-500"
                    : val >= 70
                    ? "bg-yellow-400"
                    : "bg-red-500"
                  : "bg-indigo-400";

              return (
                <div key={point.date} className="flex flex-col items-center gap-1 flex-1 min-w-[18px]">
                  <div className="w-full flex flex-col justify-end h-32 relative group">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {point.date}
                      <br />
                      {metric === "passRate"
                        ? val != null ? `合格率: ${val}%` : "データなし"
                        : val != null ? `平均: ${(val / 1000).toFixed(1)}s` : "データなし"}
                      <br />
                      実行数: {point.runs}
                    </div>
                    <div
                      className={clsx("w-full rounded-t transition-all", color)}
                      style={{ height: val != null ? `${Math.max(barPct, 2)}%` : "2%" }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-400 rotate-45 origin-left">
                    {point.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          {metric === "passRate" && (
            <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" />≥90%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-yellow-400" />70-89%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" />&lt;70%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Flaky ─────────────────────────────────────────────────────────────────────

function FlakyTab({ flaky, loading }: { flaky: FlakyTest[]; loading: boolean }) {
  const maxFailRate = flaky[0]?.failRate ?? 1;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">過去 30 日間でパス・フェイルが混在するテスト（不安定）</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : flaky.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-green-500" />
          <p className="text-sm text-gray-600 font-medium">不安定なテストはありません</p>
          <p className="text-xs text-gray-400 mt-1">過去 30 日間、全テストが安定しています</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flaky.map((test) => {
            const pct = Math.round(test.failRate * 100);
            const severity = test.failRate >= 0.5 ? "high" : test.failRate >= 0.2 ? "medium" : "low";

            return (
              <div
                key={test.testId}
                className={clsx(
                  "bg-white border rounded-xl px-4 py-3",
                  severity === "high" && "border-red-200",
                  severity === "medium" && "border-amber-200",
                  severity === "low" && "border-gray-200"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full shrink-0",
                      severity === "high" && "bg-red-500",
                      severity === "medium" && "bg-amber-400",
                      severity === "low" && "bg-yellow-300"
                    )}
                  />
                  <span className="flex-1 text-sm font-medium text-gray-900 truncate">{test.testName}</span>
                  <span
                    className={clsx(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      severity === "high" && "bg-red-100 text-red-700",
                      severity === "medium" && "bg-amber-100 text-amber-700",
                      severity === "low" && "bg-yellow-50 text-yellow-700"
                    )}
                  >
                    失敗率 {pct}%
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        severity === "high" && "bg-red-500",
                        severity === "medium" && "bg-amber-400",
                        severity === "low" && "bg-yellow-300"
                      )}
                      style={{ width: `${(test.failRate / maxFailRate) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                    <span className="flex items-center gap-0.5"><CheckCircle2 size={11} className="text-green-500" />{test.passed}</span>
                    <span className="flex items-center gap-0.5"><XCircle size={11} className="text-red-500" />{test.failed}</span>
                    <span className="text-gray-400">/ {test.total} 回</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {flaky.length > 0 && (
        <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">改善の提案</span>
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
            <li>失敗率が高いテストは実行環境の非同期処理や待機時間を確認してください</li>
            <li>セレクタが不安定な場合は data-testid 属性の追加を検討してください</li>
            <li>テストのリトライ設定を有効にすることで一時的な失敗を吸収できます</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Slowest ───────────────────────────────────────────────────────────────────

function SlowestTab({ slowest, loading }: { slowest: SlowestTest[]; loading: boolean }) {
  const maxDuration = slowest[0]?.avgDurationMs ?? 1;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-4">過去 30 日間で平均実行時間が長いテスト (上位 10 件)</p>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : slowest.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <Clock size={28} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-500">データがありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {slowest.map((test, rank) => {
            const seconds = (test.avgDurationMs / 1000).toFixed(1);
            return (
              <div key={test.testId} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-mono w-5 shrink-0">#{rank + 1}</span>
                  <span className="flex-1 text-sm font-medium text-gray-900 truncate">{test.testName}</span>
                  <span className="text-sm font-semibold text-indigo-600 shrink-0">{seconds}s</span>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full"
                      style={{ width: `${(test.avgDurationMs / maxDuration) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{test.runCount} 回実行</span>
                </div>

                {test.tags.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {test.tags.map((tag) => (
                      <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
