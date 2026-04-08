"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Plus, Trash2, RefreshCw } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { Project, Environment } from "@e2e-tool/types";

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();

  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data.data as Project),
  });

  const { data: environments } = useQuery({
    queryKey: ["projects", projectId, "environments"],
    queryFn: () => api.get(`/projects/${projectId}/environments`).then((r) => r.data.data as Environment[]),
  });

  const { data: tokens } = useQuery({
    queryKey: ["projects", projectId, "api-tokens"],
    queryFn: () =>
      api.get(`/projects/${projectId}/api-tokens`).then((r) => r.data.data as { id: string; name: string; lastUsedAt?: string; createdAt: string }[]),
  });

  const createToken = useMutation({
    mutationFn: (name: string) =>
      api.post(`/projects/${projectId}/api-tokens`, { name }).then((r) => r.data.data as { token: string; name: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "api-tokens"] });
      alert(`APIトークンが発行されました。このトークンは一度しか表示されません:\n\n${data.token}`);
    },
  });

  const deleteToken = useMutation({
    mutationFn: (tokenId: string) => api.delete(`/projects/${projectId}/api-tokens/${tokenId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "api-tokens"] }),
  });

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {/* Project Info */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">プロジェクト情報</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
          <Row label="プロジェクトID" value={<code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{project?.id}</code>} />
          <Row label="名前" value={project?.name ?? "-"} />
          <Row label="プラットフォーム" value={project?.platform ?? "-"} />
          {project?.baseUrl && <Row label="ベースURL" value={project.baseUrl} />}
        </div>
      </section>

      {/* Environment Variables */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">環境変数</h2>
        <p className="text-xs text-gray-500 mb-3">テスト内で <code className="bg-gray-100 px-1 rounded">{"{{VAR_NAME}}"}</code> として参照できます</p>
        <div className="space-y-3">
          {environments?.map((env) => (
            <EnvEditor key={env.id} env={env} projectId={projectId} />
          ))}
        </div>
      </section>

      {/* API Tokens */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">APIトークン</h2>
            <p className="text-xs text-gray-500">CI/CDからテストを実行する際に使用します</p>
          </div>
          <button
            onClick={() => {
              const name = prompt("トークン名を入力してください");
              if (name) createToken.mutate(name);
            }}
            className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-700"
          >
            <Plus size={13} />
            発行
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {tokens?.length === 0 && (
            <p className="text-sm text-gray-400 px-4 py-3">APIトークンがありません</p>
          )}
          {tokens?.map((token, i) => (
            <div
              key={token.id}
              className={clsx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-gray-100")}
            >
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{token.name}</p>
                <p className="text-xs text-gray-400">
                  最終使用: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString("ja-JP") : "未使用"}
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`「${token.name}」を削除しますか？`)) deleteToken.mutate(token.id);
                }}
                className="p-1.5 text-red-400 hover:bg-red-50 rounded"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-700 mb-2">GitHub Actions での使い方</p>
          <pre className="text-xs text-gray-600 overflow-x-auto">{`- name: Run E2E Tests
  run: |
    curl -X POST \\
      -H "Authorization: Bearer $E2E_API_TOKEN" \\
      -H "Content-Type: application/json" \\
      -d '{"testIds": ["test_id_here"]}' \\
      ${window?.location?.origin ?? "http://localhost:3000"}/api/v1/runs`}</pre>
        </div>
      </section>
    </div>
  );
}

function EnvEditor({ env, projectId }: { env: Environment; projectId: string }) {
  const qc = useQueryClient();
  const [vars, setVars] = useState<Record<string, string>>(env.variables as Record<string, string>);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/projects/${projectId}/environments/${env.id}`, { variables: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "environments"] }),
  });

  const addVar = () => {
    if (!newKey.trim()) return;
    setVars((p) => ({ ...p, [newKey.trim()]: newVal }));
    setNewKey("");
    setNewVal("");
  };

  const removeVar = (key: string) => {
    const next = { ...vars };
    delete next[key];
    setVars(next);
  };

  const envLabel = ({ development: "開発環境", staging: "ステージング", production: "本番" } as Record<string, string>)[env.name] ?? env.name;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-800">{envLabel}</span>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="text-xs text-primary-600 hover:underline flex items-center gap-1"
        >
          <RefreshCw size={11} />
          保存
        </button>
      </div>

      <div className="space-y-1.5 mb-3">
        {Object.entries(vars).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <code className="text-xs bg-gray-100 px-2 py-1 rounded flex-1">{key}</code>
            <input
              type="text"
              value={value}
              onChange={(e) => setVars((p) => ({ ...p, [key]: e.target.value }))}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <button onClick={() => removeVar(key)} className="text-red-400 hover:text-red-600">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="KEY"
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <input
          type="text"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          placeholder="value"
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          onClick={addVar}
          className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 flex items-center gap-1"
        >
          <Plus size={11} />
          追加
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

function clsx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
