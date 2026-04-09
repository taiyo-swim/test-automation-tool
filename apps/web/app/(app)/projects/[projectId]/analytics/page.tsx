"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
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

export default function AnalyticsPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: flaky = [], isLoading } = useQuery({
    queryKey: ["analytics", "flaky", projectId],
    queryFn: () =>
      api.get(`/projects/${projectId}/analytics/flaky`).then((r) => r.data.data as FlakyTest[]),
  });

  const maxFailRate = flaky[0]?.failRate ?? 1;

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-base font-semibold text-gray-900">テスト分析</h1>
        <p className="text-xs text-gray-500 mt-0.5">過去 30 日間のテスト安定性</p>
      </div>

      {/* Flaky test section */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={15} className="text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-800">不安定なテスト (Flaky Tests)</h2>
        </div>

        {isLoading ? (
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
              const severity =
                test.failRate >= 0.5 ? "high" : test.failRate >= 0.2 ? "medium" : "low";

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
                    {/* Bar */}
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
                      <span className="flex items-center gap-0.5">
                        <CheckCircle2 size={11} className="text-green-500" />
                        {test.passed}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <XCircle size={11} className="text-red-500" />
                        {test.failed}
                      </span>
                      <span className="text-gray-400">/ {test.total} 回</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Summary card */}
      {flaky.length > 0 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-800">改善の提案</span>
          </div>
          <ul className="text-xs text-amber-700 space-y-1 list-disc pl-4">
            <li>失敗率が高いテストは実行環境の非同期処理や待機時間を確認してください</li>
            <li>セレクタが不安定な場合は data-testid 属性の追加を検討してください</li>
            <li>セルフヒーリング機能で自動修正された場合はセレクタを更新してください</li>
          </ul>
        </div>
      )}
    </div>
  );
}
