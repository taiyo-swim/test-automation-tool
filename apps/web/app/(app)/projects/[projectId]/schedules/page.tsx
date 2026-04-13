"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Clock, ToggleLeft, ToggleRight, Calendar } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { Test } from "@e2e-tool/types";
import clsx from "clsx";

interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  nextRunAt: string | null;
  createdAt: string;
}

const CRON_PRESETS = [
  { label: "毎時", value: "0 * * * *" },
  { label: "毎日 0時", value: "0 0 * * *" },
  { label: "毎日 9時", value: "0 9 * * *" },
  { label: "毎週月曜 9時", value: "0 9 * * 1" },
  { label: "毎週金曜 18時", value: "0 18 * * 5" },
  { label: "30分ごと", value: "*/30 * * * *" },
];

export default function SchedulesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", cronExpression: "0 9 * * 1", testIds: [] as string[] });
  const [error, setError] = useState("");

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["schedules", projectId],
    queryFn: () => api.get(`/projects/${projectId}/schedules`).then((r) => r.data.data as Schedule[]),
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests", projectId],
    queryFn: () => api.get(`/projects/${projectId}/tests`).then((r) => r.data.data as Test[]),
  });

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/schedules`, { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules", projectId] });
      setShowForm(false);
      setForm({ name: "", cronExpression: "0 9 * * 1", testIds: [] });
      setError("");
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setError(e.response?.data?.message ?? "エラーが発生しました");
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.patch(`/projects/${projectId}/schedules/${id}`, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules", projectId] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/schedules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules", projectId] }),
  });

  const toggleTest = (testId: string) => {
    setForm((prev) => ({
      ...prev,
      testIds: prev.testIds.includes(testId)
        ? prev.testIds.filter((id) => id !== testId)
        : [...prev.testIds, testId],
    }));
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-gray-900">スケジュール実行</h1>
          <p className="text-xs text-gray-500 mt-0.5">cron 式でテストを自動実行</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus size={14} />
          スケジュールを追加
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">新しいスケジュール</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">名前</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: 夜間回帰テスト"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">cron 式</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setForm((prev) => ({ ...prev, cronExpression: p.value }))}
                  className={clsx(
                    "text-xs px-2 py-1 rounded-lg border transition-colors",
                    form.cronExpression === p.value
                      ? "bg-primary-50 border-primary-300 text-primary-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.cronExpression}
              onChange={(e) => setForm((p) => ({ ...p, cronExpression: e.target.value }))}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="0 9 * * 1"
            />
            <p className="text-xs text-gray-400 mt-1">
              書式: 分 時 日 月 曜日　例: <code>0 9 * * 1</code> = 毎週月曜 9:00
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">実行するテスト</label>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tests.map((test) => (
                <label key={test.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.testIds.includes(test.id)}
                    onChange={() => toggleTest(test.id)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-800">{test.name}</span>
                </label>
              ))}
              {tests.length === 0 && (
                <p className="text-xs text-gray-400 px-3 py-2">テストがありません</p>
              )}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={() => create.mutate()}
              disabled={!form.name || !form.cronExpression || form.testIds.length === 0 || create.isPending}
              className="flex-1 bg-primary-600 text-white py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {create.isPending ? "作成中..." : "作成"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(""); }}
              className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Schedule list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : schedules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Calendar size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">スケジュールがありません</p>
          <p className="text-xs mt-1">「スケジュールを追加」から作成してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <div key={schedule.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4">
              <div className={clsx("mt-0.5 rounded-full p-1.5", schedule.enabled ? "bg-green-100" : "bg-gray-100")}>
                <Clock size={14} className={schedule.enabled ? "text-green-600" : "text-gray-400"} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{schedule.name}</span>
                  {!schedule.enabled && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">無効</span>
                  )}
                </div>
                <code className="text-xs text-gray-500 mt-0.5 block">{schedule.cronExpression}</code>
                {schedule.nextRunAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    次回: {new Date(schedule.nextRunAt).toLocaleString("ja-JP")}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggle.mutate({ id: schedule.id, enabled: !schedule.enabled })}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                  title={schedule.enabled ? "無効化" : "有効化"}
                >
                  {schedule.enabled ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                </button>
                <button
                  onClick={() => { if (confirm("削除しますか?")) remove.mutate(schedule.id); }}
                  className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
