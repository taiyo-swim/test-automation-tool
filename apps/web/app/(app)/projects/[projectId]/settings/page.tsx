"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, RefreshCw, Bell, Key, Server } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { Project, Environment } from "@e2e-tool/types";
import clsx from "clsx";

type SettingsTab = "general" | "notifications" | "tokens";

interface NotificationSetting {
  slackWebhookUrl?: string | null;
  notifyOnFailure: boolean;
  notifyOnRecovery: boolean;
  notifyOnSuccess: boolean;
  emailRecipients: string[];
}

export default function ProjectSettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<SettingsTab>("general");

  return (
    <div className="p-6 max-w-2xl">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(
          [
            { key: "general", label: "全般", icon: Server },
            { key: "notifications", label: "通知", icon: Bell },
            { key: "tokens", label: "APIトークン", icon: Key },
          ] as { key: SettingsTab; label: string; icon: React.ElementType }[]
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
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && <GeneralTab projectId={projectId} />}
      {tab === "notifications" && <NotificationsTab projectId={projectId} />}
      {tab === "tokens" && <TokensTab projectId={projectId} />}
    </div>
  );
}

// ── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({ projectId }: { projectId: string }) {
  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data.data as Project),
  });

  const { data: environments } = useQuery({
    queryKey: ["projects", projectId, "environments"],
    queryFn: () => api.get(`/projects/${projectId}/environments`).then((r) => r.data.data as Environment[]),
  });

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">プロジェクト情報</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
          <Row label="プロジェクトID" value={<code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{project?.id}</code>} />
          <Row label="名前" value={project?.name ?? "-"} />
          <Row label="プラットフォーム" value={project?.platform ?? "-"} />
          {project?.baseUrl && <Row label="ベースURL" value={project.baseUrl} />}
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-1">環境変数</h2>
        <p className="text-xs text-gray-500 mb-3">
          テスト内で <code className="bg-gray-100 px-1 rounded">{"{{VAR_NAME}}"}</code> として参照できます
        </p>
        <div className="space-y-3">
          {environments?.map((env) => (
            <EnvEditor key={env.id} env={env} projectId={projectId} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Notifications Tab ────────────────────────────────────────────────────────

function NotificationsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [emailInput, setEmailInput] = useState("");

  const { data: setting } = useQuery({
    queryKey: ["projects", projectId, "notification-settings"],
    queryFn: () =>
      api.get(`/projects/${projectId}/notification-settings`).then((r) => r.data.data as NotificationSetting | null),
  });

  const [form, setForm] = useState<NotificationSetting>({
    slackWebhookUrl: "",
    notifyOnFailure: true,
    notifyOnRecovery: true,
    notifyOnSuccess: false,
    emailRecipients: [],
  });

  // Sync server data into form once loaded
  const [initialized, setInitialized] = useState(false);
  if (setting !== undefined && !initialized) {
    setForm({
      slackWebhookUrl: setting?.slackWebhookUrl ?? "",
      notifyOnFailure: setting?.notifyOnFailure ?? true,
      notifyOnRecovery: setting?.notifyOnRecovery ?? true,
      notifyOnSuccess: setting?.notifyOnSuccess ?? false,
      emailRecipients: setting?.emailRecipients ?? [],
    });
    setInitialized(true);
  }

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/projects/${projectId}/notification-settings`, {
        slackWebhookUrl: form.slackWebhookUrl || null,
        notifyOnFailure: form.notifyOnFailure,
        notifyOnRecovery: form.notifyOnRecovery,
        notifyOnSuccess: form.notifyOnSuccess,
        emailRecipients: form.emailRecipients,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "notification-settings"] }),
  });

  const addEmail = () => {
    const email = emailInput.trim();
    if (!email || form.emailRecipients.includes(email)) return;
    setForm((f) => ({ ...f, emailRecipients: [...f.emailRecipients, email] }));
    setEmailInput("");
  };

  const removeEmail = (e: string) =>
    setForm((f) => ({ ...f, emailRecipients: f.emailRecipients.filter((x) => x !== e) }));

  const toggle = (key: keyof Pick<NotificationSetting, "notifyOnFailure" | "notifyOnRecovery" | "notifyOnSuccess">) =>
    setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <div className="space-y-6">
      {/* Slack */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="text-lg">💬</span> Slack 通知
        </h3>
        <label className="block text-xs text-gray-500 mb-1">Incoming Webhook URL</label>
        <input
          type="url"
          value={form.slackWebhookUrl ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, slackWebhookUrl: e.target.value }))}
          placeholder="https://hooks.slack.com/services/..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          未入力の場合はシステム全体の SLACK_WEBHOOK_URL を使用します
        </p>
      </section>

      {/* Events */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">通知イベント</h3>
        <div className="space-y-3">
          <Toggle
            checked={form.notifyOnFailure}
            onChange={() => toggle("notifyOnFailure")}
            label="テスト失敗時"
            description="1件でも FAILED になった場合に通知"
          />
          <Toggle
            checked={form.notifyOnRecovery}
            onChange={() => toggle("notifyOnRecovery")}
            label="復旧時 (失敗→成功)"
            description="前回失敗していたテストが全て成功した場合に通知"
          />
          <Toggle
            checked={form.notifyOnSuccess}
            onChange={() => toggle("notifyOnSuccess")}
            label="成功時"
            description="全テストが PASSED になるたびに通知"
          />
        </div>
      </section>

      {/* Email */}
      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="text-lg">📧</span> メール通知
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEmail()}
            placeholder="name@example.com"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <button
            onClick={addEmail}
            className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm"
          >
            <Plus size={13} /> 追加
          </button>
        </div>
        {form.emailRecipients.length === 0 ? (
          <p className="text-xs text-gray-400">メール宛先が設定されていません</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {form.emailRecipients.map((e) => (
              <span
                key={e}
                className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-full"
              >
                {e}
                <button onClick={() => removeEmail(e)} className="text-gray-400 hover:text-red-500">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
      >
        {save.isPending ? "保存中..." : "設定を保存"}
      </button>
      {save.isSuccess && <span className="text-xs text-green-600 ml-2">✓ 保存しました</span>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-gray-800">{label}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={clsx(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors",
          checked ? "bg-primary-600" : "bg-gray-200"
        )}
      >
        <span
          className={clsx(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

// ── Tokens Tab ───────────────────────────────────────────────────────────────

function TokensTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [newToken, setNewToken] = useState<string | null>(null);

  const { data: tokens = [] } = useQuery({
    queryKey: ["projects", projectId, "api-tokens"],
    queryFn: () =>
      api
        .get(`/projects/${projectId}/api-tokens`)
        .then((r) => r.data.data as { id: string; name: string; lastUsedAt?: string; createdAt: string }[]),
  });

  const createToken = useMutation({
    mutationFn: (name: string) =>
      api
        .post(`/projects/${projectId}/api-tokens`, { name })
        .then((r) => r.data.data as { token: string; name: string }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "api-tokens"] });
      setNewToken(data.token);
    },
  });

  const deleteToken = useMutation({
    mutationFn: (tokenId: string) => api.delete(`/projects/${projectId}/api-tokens/${tokenId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "api-tokens"] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
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

      {/* Newly created token — shown only once */}
      {newToken && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-xs font-medium text-amber-800 mb-2">
            ⚠ このトークンは一度しか表示されません。今すぐコピーしてください。
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-3 py-2 break-all">
              {newToken}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(newToken); }}
              className="text-xs bg-amber-600 text-white px-2 py-1.5 rounded hover:bg-amber-700"
            >
              コピー
            </button>
          </div>
          <button onClick={() => setNewToken(null)} className="text-xs text-amber-600 mt-2 hover:underline">
            閉じる
          </button>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {tokens.length === 0 && (
          <p className="text-sm text-gray-400 px-4 py-4">APIトークンがありません</p>
        )}
        {tokens.map((token, i) => (
          <div
            key={token.id}
            className={clsx("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-gray-100")}
          >
            <Key size={14} className="text-gray-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{token.name}</p>
              <p className="text-xs text-gray-400">
                最終使用: {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString("ja-JP") : "未使用"} ·
                作成: {new Date(token.createdAt).toLocaleDateString("ja-JP")}
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

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-700 mb-2">GitHub Actions での使い方</p>
        <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">{`- name: Run E2E Tests
  env:
    E2E_API_TOKEN: \${{ secrets.E2E_API_TOKEN }}
  run: |
    curl -s -X POST \\
      -H "Authorization: Bearer $E2E_API_TOKEN" \\
      -H "Content-Type: application/json" \\
      -d '{"testIds":["<test-id>"],"parallelism":3}' \\
      https://your-domain.com/api/v1/runs`}</pre>
      </div>
    </div>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

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

  const envLabel =
    ({ development: "開発環境", staging: "ステージング", production: "本番" } as Record<string, string>)[env.name] ??
    env.name;

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
