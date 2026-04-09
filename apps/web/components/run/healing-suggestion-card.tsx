"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import clsx from "clsx";

interface HealingSuggestion {
  id: string;
  originalSelector: string;
  suggestedSelector: string;
  confidence: number;
  reason: string;
  status: "pending" | "accepted" | "rejected";
}

export function HealingSuggestionCard({
  suggestion,
  runId,
}: {
  suggestion: HealingSuggestion;
  runId: string;
}) {
  const qc = useQueryClient();

  const accept = useMutation({
    mutationFn: () => api.post(`/healing-suggestions/${suggestion.id}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", runId] }),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/healing-suggestions/${suggestion.id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs", runId] }),
  });

  const confidencePct = Math.round(suggestion.confidence * 100);

  return (
    <div
      className={clsx(
        "rounded-lg border p-3 text-sm",
        suggestion.status === "pending" && "border-amber-200 bg-amber-50",
        suggestion.status === "accepted" && "border-green-200 bg-green-50",
        suggestion.status === "rejected" && "border-gray-200 bg-gray-50"
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <Wrench size={13} className="text-amber-600 shrink-0" />
        <span className="font-medium text-gray-800 text-xs">セルフヒーリング候補</span>
        <span
          className={clsx(
            "ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium",
            confidencePct >= 80 && "bg-green-100 text-green-700",
            confidencePct >= 60 && confidencePct < 80 && "bg-yellow-100 text-yellow-700",
            confidencePct < 60 && "bg-gray-100 text-gray-600"
          )}
        >
          信頼度 {confidencePct}%
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 w-16 shrink-0">変更前</span>
          <code className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-red-600 break-all">
            {suggestion.originalSelector}
          </code>
        </div>
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 w-16 shrink-0">変更後</span>
          <code className="text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-green-600 break-all">
            {suggestion.suggestedSelector}
          </code>
        </div>
        <p className="text-xs text-gray-500 ml-18 pl-[4.5rem]">{suggestion.reason}</p>
      </div>

      {suggestion.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => accept.mutate()}
            disabled={accept.isPending}
            className="flex items-center gap-1 text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 size={11} />
            適用してテストを修正
          </button>
          <button
            onClick={() => reject.mutate()}
            disabled={reject.isPending}
            className="flex items-center gap-1 text-xs border border-gray-300 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          >
            <XCircle size={11} />
            却下
          </button>
        </div>
      )}

      {suggestion.status === "accepted" && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle2 size={11} /> テストのセレクタを更新しました
        </p>
      )}
      {suggestion.status === "rejected" && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <XCircle size={11} /> 却下済み
        </p>
      )}
    </div>
  );
}
