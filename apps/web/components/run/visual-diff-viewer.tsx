"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, SplitSquareHorizontal, Blend } from "lucide-react";
import { api } from "../../lib/api";
import clsx from "clsx";

interface VisualDiff {
  id: string;
  stepResultId: string;
  baselineId: string;
  diffImageUrl?: string;
  diffPercentage: number;
  status: "pending" | "approved" | "rejected";
}

interface Props {
  diff: VisualDiff;
  screenshotUrl?: string;
  runId: string;
  projectId: string;
}

type ViewMode = "split" | "diff" | "overlay";

export function VisualDiffViewer({ diff, screenshotUrl, runId, projectId }: Props) {
  const [mode, setMode] = useState<ViewMode>("split");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const qc = useQueryClient();

  const approve = useMutation({
    mutationFn: () => api.post(`/visual-diffs/${diff.id}/approve`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", runId] }),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/visual-diffs/${diff.id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", runId] }),
  });

  const updateBaseline = useMutation({
    mutationFn: () =>
      api.post(`/visual-baselines/${diff.baselineId}/update`, {
        newImageUrl: screenshotUrl,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", runId] }),
  });

  const diffPct = diff.diffPercentage.toFixed(2);
  const isWarning = diff.diffPercentage > 0.5;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 flex-1">
          <span
            className={clsx(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              diff.status === "pending" && isWarning && "bg-red-100 text-red-700",
              diff.status === "pending" && !isWarning && "bg-yellow-100 text-yellow-700",
              diff.status === "approved" && "bg-green-100 text-green-700",
              diff.status === "rejected" && "bg-gray-100 text-gray-600"
            )}
          >
            差分 {diffPct}%
          </span>
          <span className="text-xs text-gray-500">
            {diff.status === "pending"
              ? "レビュー待ち"
              : diff.status === "approved"
              ? "承認済み"
              : "却下済み"}
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          {(["split", "diff", "overlay"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx(
                "px-2 py-1 text-xs rounded transition-colors",
                mode === m ? "bg-primary-600 text-white" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {m === "split" ? "比較" : m === "diff" ? "差分" : "オーバーレイ"}
            </button>
          ))}
        </div>

        {/* Actions */}
        {diff.status === "pending" && (
          <div className="flex gap-1.5">
            <button
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 size={12} />
              承認
            </button>
            <button
              onClick={() => updateBaseline.mutate()}
              disabled={updateBaseline.isPending}
              className="flex items-center gap-1 text-xs bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              ベースライン更新
            </button>
            <button
              onClick={() => reject.mutate()}
              disabled={reject.isPending}
              className="flex items-center gap-1 text-xs border border-red-300 text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <XCircle size={12} />
              却下
            </button>
          </div>
        )}
      </div>

      {/* Image viewer */}
      <div className="p-4 bg-gray-900">
        {mode === "split" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">ベースライン</p>
              <img
                src={`/api/files/baselines/${diff.baselineId}.png`}
                alt="baseline"
                className="w-full rounded border border-gray-700"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1.5">現在</p>
              {screenshotUrl ? (
                <img src={screenshotUrl} alt="current" className="w-full rounded border border-gray-700" />
              ) : (
                <div className="w-full h-32 bg-gray-800 rounded flex items-center justify-center text-gray-500 text-xs">
                  スクリーンショットなし
                </div>
              )}
            </div>
          </div>
        )}

        {mode === "diff" && diff.diffImageUrl && (
          <div>
            <p className="text-xs text-gray-400 mb-1.5">差分ハイライト (赤 = 変更箇所)</p>
            <img src={diff.diffImageUrl} alt="diff" className="w-full rounded border border-gray-700" />
          </div>
        )}

        {mode === "overlay" && screenshotUrl && (
          <div className="relative">
            <p className="text-xs text-gray-400 mb-1.5">
              オーバーレイ (不透明度: {overlayOpacity}%)
            </p>
            <div className="relative">
              <img
                src={`/api/files/baselines/${diff.baselineId}.png`}
                alt="baseline"
                className="w-full rounded border border-gray-700"
              />
              <img
                src={screenshotUrl}
                alt="current overlay"
                className="absolute inset-0 w-full rounded"
                style={{ opacity: overlayOpacity / 100 }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={overlayOpacity}
              onChange={(e) => setOverlayOpacity(Number(e.target.value))}
              className="w-full mt-3"
            />
          </div>
        )}
      </div>
    </div>
  );
}
