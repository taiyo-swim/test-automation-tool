"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Copy, Trash2, FlaskConical, Tag, X, Search } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { Test } from "@e2e-tool/types";
import clsx from "clsx";

export default function TestsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewTest, setShowNewTest] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [runModal, setRunModal] = useState<{ testIds: string[] } | null>(null);

  const { data: tests, isLoading } = useQuery({
    queryKey: ["projects", projectId, "tests"],
    queryFn: () => api.get(`/projects/${projectId}/tests`).then((r) => r.data.data as Test[]),
  });

  // Collect all unique tags across tests
  const allTags = useMemo(
    () => Array.from(new Set(tests?.flatMap((t) => t.tags) ?? [])).sort(),
    [tests]
  );

  const filtered = useMemo(() => {
    let result = tests ?? [];
    if (tagFilter) result = result.filter((t) => t.tags.includes(tagFilter));
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [tests, tagFilter, searchQuery]);

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          テスト一覧{" "}
          {tests && (
            <span className="text-gray-400 font-normal">
              ({filtered?.length ?? 0}{tagFilter ? ` / ${tests.length}` : ""})
            </span>
          )}
        </h2>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setRunModal({ testIds: Array.from(selected) })}
              className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700"
            >
              <Play size={14} />
              選択を実行 ({selected.size})
            </button>
          )}
          <button
            onClick={() => setRunModal({ testIds: filtered?.map((t) => t.id) ?? [] })}
            disabled={!filtered?.length}
            className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <Play size={14} />
            {tagFilter ? `"${tagFilter}" を実行` : "全て実行"}
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

      {/* Search bar */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="テスト名・説明で検索..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Tag size={11} /> タグ:
          </span>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
              className={clsx(
                "text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                tagFilter === tag
                  ? "bg-primary-600 text-white border-primary-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {tag}
            </button>
          ))}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-600"
            >
              <X size={11} /> クリア
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FlaskConical size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">
            {searchQuery
              ? `"${searchQuery}" に一致するテストがありません`
              : tagFilter
              ? `"${tagFilter}" のテストがありません`
              : "テストがありません"}
          </p>
          {!tagFilter && !searchQuery && <p className="text-xs mt-1">「新規テスト」から作成してください</p>}
        </div>
      )}

      <div className="space-y-1">
        {filtered?.map((test) => (
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
                <div className="flex flex-wrap gap-1 mt-1">
                  {test.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={(e) => { e.stopPropagation(); setTagFilter(tag); }}
                      className={clsx(
                        "px-1.5 py-0.5 text-xs rounded transition-colors",
                        tagFilter === tag
                          ? "bg-primary-100 text-primary-700"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setRunModal({ testIds: [test.id] })}
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
                  if (confirm(`「${test.name}」を削除しますか？`)) deleteTest.mutate(test.id);
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

      {runModal && (
        <RunTriggerModal
          projectId={projectId}
          testIds={runModal.testIds}
          onClose={() => setRunModal(null)}
          onStarted={(runId) => router.push(`/projects/${projectId}/runs/${runId}`)}
        />
      )}
    </div>
  );
}

// ── Run Trigger Modal ────────────────────────────────────────────────────────

function RunTriggerModal({
  projectId,
  testIds,
  onClose,
  onStarted,
}: {
  projectId: string;
  testIds: string[];
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const { data: environments } = useQuery({
    queryKey: ["projects", projectId, "environments"],
    queryFn: () =>
      api.get(`/projects/${projectId}/environments`).then((r) => r.data.data as { id: string; name: string }[]),
  });

  const [environment, setEnvironment] = useState("");
  const [parallelism, setParallelism] = useState(1);

  const startRun = useMutation({
    mutationFn: () =>
      api
        .post(`/projects/${projectId}/runs`, {
          testIds,
          environment: environment || undefined,
          parallelism,
        })
        .then((r) => r.data.data as { runId: string }),
    onSuccess: (data) => onStarted(data.runId),
  });

  const envLabel: Record<string, string> = { development: "開発環境", staging: "ステージング", production: "本番" };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">テスト実行</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">テスト数</label>
            <p className="text-sm text-gray-500">{testIds.length} 件</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">実行環境</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">デフォルト</option>
              {environments?.map((e) => (
                <option key={e.id} value={e.name}>
                  {envLabel[e.name] ?? e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              並列数 <span className="text-primary-600 font-semibold">{parallelism}</span>
            </label>
            <input
              type="range"
              min={1}
              max={Math.min(testIds.length, 10)}
              value={parallelism}
              onChange={(e) => setParallelism(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>1 (順次)</span>
              <span>{Math.min(testIds.length, 10)} (最大)</span>
            </div>
            {parallelism > 1 && (
              <p className="text-xs text-blue-600 mt-1">
                {parallelism} テストを同時並行で実行します
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => startRun.mutate()}
            disabled={startRun.isPending}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Play size={13} />
            {startRun.isPending ? "起動中..." : "実行開始"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Test Modal ────────────────────────────────────────────────────────────

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
              autoFocus
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
