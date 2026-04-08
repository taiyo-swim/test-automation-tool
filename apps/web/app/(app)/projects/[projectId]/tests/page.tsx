"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Copy, Trash2, FlaskConical } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { Test } from "@e2e-tool/types";

export default function TestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewTest, setShowNewTest] = useState(false);

  const { data: tests, isLoading } = useQuery({
    queryKey: ["projects", projectId, "tests"],
    queryFn: () => api.get(`/projects/${projectId}/tests`).then((r) => r.data.data as Test[]),
  });

  const createTest = useMutation({
    mutationFn: (values: { name: string; description?: string }) =>
      api.post(`/projects/${projectId}/tests`, values).then((r) => r.data.data as Test),
    onSuccess: (test) => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "tests"] });
      setShowNewTest(false);
      router.push(`/projects/${projectId}/tests/${test.id}/edit`);
    },
  });

  const deleteTest = useMutation({
    mutationFn: (testId: string) => api.delete(`/projects/${projectId}/tests/${testId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "tests"] }),
  });

  const duplicateTest = useMutation({
    mutationFn: (testId: string) =>
      api.post(`/projects/${projectId}/tests/${testId}/duplicate`).then((r) => r.data.data as Test),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "tests"] }),
  });

  const startRun = useMutation({
    mutationFn: (testIds: string[]) =>
      api.post(`/projects/${projectId}/runs`, { testIds }).then((r) => r.data.data),
    onSuccess: (data) => {
      router.push(`/projects/${projectId}/runs/${data.runId}`);
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const runSelected = () => {
    if (selected.size === 0) return;
    startRun.mutate(Array.from(selected));
  };

  const runAll = () => {
    if (!tests || tests.length === 0) return;
    startRun.mutate(tests.map((t) => t.id));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900">
          テスト一覧 {tests && <span className="text-gray-400 font-normal">({tests.length})</span>}
        </h2>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={runSelected}
              disabled={startRun.isPending}
              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              <Play size={14} />
              選択を実行 ({selected.size})
            </button>
          )}
          <button
            onClick={runAll}
            disabled={startRun.isPending || !tests?.length}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Play size={14} />
            全て実行
          </button>
          <button
            onClick={() => setShowNewTest(true)}
            className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus size={14} />
            新規テスト
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        </div>
      )}

      {!isLoading && (!tests || tests.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <FlaskConical size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">テストがありません</p>
          <p className="text-xs mt-1">「新規テスト」から作成してください</p>
        </div>
      )}

      <div className="space-y-1">
        {tests?.map((test) => (
          <div
            key={test.id}
            className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3 hover:border-gray-300 group"
          >
            <input
              type="checkbox"
              checked={selected.has(test.id)}
              onChange={() => toggleSelect(test.id)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              onClick={(e) => e.stopPropagation()}
            />

            <div
              className="flex-1 min-w-0 cursor-pointer"
              onClick={() => router.push(`/projects/${projectId}/tests/${test.id}/edit`)}
            >
              <p className="text-sm font-medium text-gray-900">{test.name}</p>
              {test.description && (
                <p className="text-xs text-gray-400 truncate">{test.description}</p>
              )}
              {test.tags.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {test.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => startRun.mutate([test.id])}
                disabled={startRun.isPending}
                className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                title="実行"
              >
                <Play size={14} />
              </button>
              <button
                onClick={() => duplicateTest.mutate(test.id)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="複製"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`「${test.name}」を削除しますか？`)) {
                    deleteTest.mutate(test.id);
                  }
                }}
                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                title="削除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNewTest && (
        <NewTestModal
          onClose={() => setShowNewTest(false)}
          onCreate={(v) => createTest.mutate(v)}
          loading={createTest.isPending}
        />
      )}
    </div>
  );
}

function NewTestModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void;
  onCreate: (v: { name: string; description?: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">新規テスト作成</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onCreate({ name, description: description || undefined });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">テスト名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: ログインフロー"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">説明 (任意)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? "作成中..." : "作成してエディタを開く"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
