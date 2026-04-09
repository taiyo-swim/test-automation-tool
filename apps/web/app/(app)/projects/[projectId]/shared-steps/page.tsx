"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, ChevronDown, Layers, Save, X } from "lucide-react";
import { api } from "../../../../../lib/api";
import type { StepAction } from "@e2e-tool/types";
import clsx from "clsx";

interface StepDef {
  order: number;
  action: StepAction;
  params: Record<string, unknown>;
}

interface SharedStep {
  id: string;
  name: string;
  steps: StepDef[];
}

const ACTION_LABELS: Partial<Record<StepAction, string>> = {
  navigate: "URLに移動",
  click: "クリック",
  double_click: "ダブルクリック",
  input: "テキスト入力",
  clear: "入力クリア",
  select: "ドロップダウン選択",
  check: "チェックをつける",
  uncheck: "チェックを外す",
  scroll: "スクロール",
  assert_text: "テキスト確認",
  assert_visible: "要素が表示されている",
  assert_hidden: "要素が非表示",
  assert_url: "URL確認",
  wait: "待機",
  screenshot: "スクリーンショット",
};

function stepSummary(step: StepDef): string {
  const label = ACTION_LABELS[step.action] ?? step.action;
  const detail =
    (step.params.selector as string) ||
    (step.params.url as string) ||
    (step.params.value as string) ||
    "";
  return detail ? `${label}: ${detail}` : label;
}

export default function SharedStepsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSteps, setFormSteps] = useState<StepDef[]>([]);

  const { data: sharedSteps = [], isLoading } = useQuery({
    queryKey: ["shared-steps", projectId],
    queryFn: () => api.get(`/projects/${projectId}/shared-steps`).then((r) => r.data.data as SharedStep[]),
  });

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/shared-steps`, { name: formName, steps: formSteps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shared-steps", projectId] }); resetForm(); },
  });

  const update = useMutation({
    mutationFn: (id: string) => api.patch(`/projects/${projectId}/shared-steps/${id}`, { name: formName, steps: formSteps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shared-steps", projectId] }); resetForm(); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/shared-steps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-steps", projectId] }),
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName("");
    setFormSteps([]);
  };

  const startEdit = (ss: SharedStep) => {
    setEditingId(ss.id);
    setFormName(ss.name);
    setFormSteps(ss.steps);
    setShowForm(true);
    setExpandedId(null);
  };

  const addStep = () => {
    setFormSteps((prev) => [...prev, { order: prev.length, action: "click", params: { selector: "" } }]);
  };

  const removeStep = (i: number) => {
    setFormSteps((prev) => prev.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, order: idx })));
  };

  const updateStep = (i: number, updates: Partial<StepDef>) => {
    setFormSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== i) return s;
        if (updates.action && updates.action !== s.action) {
          return { ...s, ...updates, params: { selector: "" } };
        }
        return { ...s, ...updates };
      })
    );
  };

  const handleSubmit = () => {
    if (editingId) update.mutate(editingId);
    else create.mutate();
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-base font-semibold text-gray-900">共有ステップ</h1>
          <p className="text-xs text-gray-500 mt-0.5">複数のテストで再利用できるステップグループ</p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Plus size={14} />
            共有ステップを作成
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800">
            {editingId ? "共有ステップを編集" : "新しい共有ステップ"}
          </h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">名前</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: ログインフロー"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">ステップ</label>
            <div className="space-y-2">
              {formSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-400 w-5 shrink-0 mt-1.5">{i + 1}</span>
                  <div className="flex-1 space-y-1.5">
                    <select
                      value={step.action}
                      onChange={(e) => updateStep(i, { action: e.target.value as StepAction })}
                      className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                    >
                      {Object.entries(ACTION_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    {(step.action !== "wait" && step.action !== "wait_for_network" && step.action !== "screenshot") && (
                      <input
                        type="text"
                        value={String(step.params.selector ?? step.params.url ?? step.params.value ?? "")}
                        onChange={(e) => {
                          const key = step.action === "navigate" ? "url" : "selector";
                          updateStep(i, { params: { ...step.params, [key]: e.target.value } });
                        }}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        placeholder={step.action === "navigate" ? "https://example.com" : "CSS セレクタ"}
                      />
                    )}
                    {step.action === "input" && (
                      <input
                        type="text"
                        value={String(step.params.value ?? "")}
                        onChange={(e) => updateStep(i, { params: { ...step.params, value: e.target.value } })}
                        className="w-full text-xs border border-gray-200 rounded px-2 py-1 bg-white"
                        placeholder="入力値"
                      />
                    )}
                  </div>
                  <button onClick={() => removeStep(i)} className="mt-1 text-red-400 hover:bg-red-50 rounded p-0.5">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addStep}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-primary-400 hover:text-primary-600"
            >
              <Plus size={12} />
              ステップを追加
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!formName || formSteps.length === 0 || create.isPending || update.isPending}
              className="flex items-center gap-1.5 bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              <Save size={13} />
              {editingId ? "更新" : "作成"}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
        </div>
      ) : sharedSteps.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Layers size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">共有ステップがありません</p>
          <p className="text-xs mt-1">ログインフローなどの繰り返しを共有ステップにまとめましょう</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sharedSteps.map((ss) => (
            <div key={ss.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                onClick={() => setExpandedId((prev) => (prev === ss.id ? null : ss.id))}
              >
                <Layers size={14} className="text-primary-500 shrink-0" />
                <span className="flex-1 text-sm font-medium text-gray-900">{ss.name}</span>
                <span className="text-xs text-gray-400">{ss.steps.length} ステップ</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(ss); }}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm("削除しますか?")) remove.mutate(ss.id); }}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <ChevronDown
                  size={14}
                  className={clsx("text-gray-400 transition-transform", expandedId === ss.id && "rotate-180")}
                />
              </div>

              {expandedId === ss.id && (
                <div className="border-t border-gray-100 divide-y divide-gray-50">
                  {ss.steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2">
                      <span className="text-xs font-mono text-gray-400 w-5">{i + 1}</span>
                      <span className="text-sm text-gray-700">{stepSummary(step)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
