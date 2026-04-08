"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Play, Save, ArrowLeft, GripVertical, Trash2, ChevronDown } from "lucide-react";
import { api } from "../../../../../../../lib/api";
import type { Test, TestStep, StepAction } from "@e2e-tool/types";
import clsx from "clsx";

// Minimal step form state (local)
interface LocalStep {
  id: string;
  order: number;
  action: StepAction;
  params: Record<string, unknown>;
}

const ACTION_OPTIONS: { value: StepAction; label: string; category: string }[] = [
  { value: "navigate", label: "URLに移動", category: "ナビゲーション" },
  { value: "click", label: "クリック", category: "操作" },
  { value: "double_click", label: "ダブルクリック", category: "操作" },
  { value: "input", label: "テキスト入力", category: "操作" },
  { value: "clear", label: "入力クリア", category: "操作" },
  { value: "select", label: "ドロップダウン選択", category: "操作" },
  { value: "check", label: "チェックをつける", category: "操作" },
  { value: "uncheck", label: "チェックを外す", category: "操作" },
  { value: "scroll", label: "スクロール", category: "操作" },
  { value: "scroll_to_element", label: "要素にスクロール", category: "操作" },
  { value: "assert_text", label: "テキスト確認", category: "アサーション" },
  { value: "assert_visible", label: "要素が表示されている", category: "アサーション" },
  { value: "assert_hidden", label: "要素が非表示", category: "アサーション" },
  { value: "assert_url", label: "URL確認", category: "アサーション" },
  { value: "assert_attribute", label: "属性確認", category: "アサーション" },
  { value: "assert_count", label: "要素数確認", category: "アサーション" },
  { value: "wait", label: "待機 (ms)", category: "待機" },
  { value: "wait_for_element", label: "要素出現待機", category: "待機" },
  { value: "wait_for_network", label: "ネットワーク完了待機", category: "待機" },
  { value: "screenshot", label: "スクリーンショット", category: "その他" },
  { value: "set_variable", label: "変数をセット", category: "変数" },
  { value: "extract_text", label: "テキストを変数に抽出", category: "変数" },
  { value: "api_request", label: "APIリクエスト", category: "API" },
];

const DEFAULT_PARAMS: Partial<Record<StepAction, Record<string, unknown>>> = {
  navigate: { url: "" },
  click: { selector: "" },
  double_click: { selector: "" },
  input: { selector: "", value: "" },
  clear: { selector: "" },
  select: { selector: "", value: "" },
  check: { selector: "" },
  uncheck: { selector: "" },
  scroll: { y: 300 },
  scroll_to_element: { selector: "" },
  assert_text: { selector: "", expected: "", mode: "contains" },
  assert_visible: { selector: "" },
  assert_hidden: { selector: "" },
  assert_url: { expected: "", mode: "contains" },
  assert_attribute: { selector: "", attribute: "", expected: "" },
  assert_count: { selector: "", expected: 1 },
  wait: { ms: 1000 },
  wait_for_element: { selector: "", state: "visible" },
  wait_for_network: {},
  screenshot: { name: "", visual_regression: false },
  set_variable: { name: "", value: "" },
  extract_text: { selector: "", variable: "" },
  api_request: { method: "GET", url: "", variable: "" },
};

function newStep(order: number, action: StepAction = "click"): LocalStep {
  return {
    id: `new-${Date.now()}-${Math.random()}`,
    order,
    action,
    params: { ...(DEFAULT_PARAMS[action] ?? {}) },
  };
}

export default function TestEditPage() {
  const { projectId, testId } = useParams<{ projectId: string; testId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: test } = useQuery({
    queryKey: ["tests", testId],
    queryFn: () => api.get(`/projects/${projectId}/tests/${testId}`).then((r) => r.data.data as Test & { steps: TestStep[] }),
  });

  const [steps, setSteps] = useState<LocalStep[]>([]);
  const [dirty, setDirty] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  useEffect(() => {
    if (test?.steps) {
      setSteps(test.steps.map((s) => ({ ...s, params: s.params as Record<string, unknown> })));
    }
  }, [test]);

  const saveSteps = useMutation({
    mutationFn: () =>
      api.put(`/projects/${projectId}/tests/${testId}/steps`, {
        steps: steps.map((s, i) => ({ ...s, order: i })),
      }),
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["tests", testId] });
    },
  });

  const startRun = useMutation({
    mutationFn: () =>
      api.post(`/projects/${projectId}/runs`, { testIds: [testId] }).then((r) => r.data.data),
    onSuccess: (data) => {
      router.push(`/projects/${projectId}/runs/${data.runId}`);
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        setSteps((items) => {
          const oldIndex = items.findIndex((s) => s.id === active.id);
          const newIndex = items.findIndex((s) => s.id === over.id);
          return arrayMove(items, oldIndex, newIndex).map((s, i) => ({ ...s, order: i }));
        });
        setDirty(true);
      }
    },
    []
  );

  const addStep = () => {
    const newS = newStep(steps.length);
    setSteps((prev) => [...prev, newS]);
    setExpandedStep(newS.id);
    setDirty(true);
  };

  const removeStep = (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
    setDirty(true);
  };

  const updateStep = (id: string, updates: Partial<LocalStep>) => {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (updates.action && updates.action !== s.action) {
          return { ...s, ...updates, params: { ...(DEFAULT_PARAMS[updates.action] ?? {}) } };
        }
        return { ...s, ...updates };
      })
    );
    setDirty(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <button
          onClick={() => router.push(`/projects/${projectId}/tests`)}
          className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm font-medium text-gray-900 flex-1">{test?.name}</span>

        {dirty && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded">未保存</span>
        )}

        <button
          onClick={() => saveSteps.mutate()}
          disabled={!dirty || saveSteps.isPending}
          className="flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          <Save size={13} />
          保存
        </button>

        <button
          onClick={() => startRun.mutate()}
          disabled={startRun.isPending}
          className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <Play size={13} />
          実行
        </button>
      </div>

      {/* Step List */}
      <div className="flex-1 overflow-auto p-5 space-y-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {steps.map((step, index) => (
              <StepCard
                key={step.id}
                step={step}
                index={index}
                expanded={expandedStep === step.id}
                onToggleExpand={() => setExpandedStep((prev) => (prev === step.id ? null : step.id))}
                onUpdate={(updates) => updateStep(step.id, updates)}
                onRemove={() => removeStep(step.id)}
              />
            ))}
          </SortableContext>
        </DndContext>

        {steps.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">ステップがありません</p>
            <p className="text-xs mt-1">「ステップを追加」から追加してください</p>
          </div>
        )}

        <button
          onClick={addStep}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-primary-400 hover:text-primary-600 transition-colors"
        >
          <Plus size={15} />
          ステップを追加
        </button>
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  expanded,
  onToggleExpand,
  onUpdate,
  onRemove,
}: {
  step: LocalStep;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<LocalStep>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const actionOption = ACTION_OPTIONS.find((a) => a.value === step.action);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden"
    >
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
        onClick={onToggleExpand}
      >
        <div
          {...attributes}
          {...listeners}
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </div>

        <span className="text-xs font-mono text-gray-400 w-5 text-center">{index + 1}</span>

        <span className="flex-1 text-sm font-medium text-gray-800">
          {actionOption?.label ?? step.action}
        </span>

        {step.params.selector && (
          <span className="text-xs text-gray-400 font-mono truncate max-w-48">
            {String(step.params.selector)}
          </span>
        )}
        {step.params.url && (
          <span className="text-xs text-gray-400 truncate max-w-48">
            {String(step.params.url)}
          </span>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="p-1 text-red-400 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>

        <ChevronDown
          size={14}
          className={clsx("text-gray-400 transition-transform", expanded && "rotate-180")}
        />
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50">
          {/* Action selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">アクション</label>
            <select
              value={step.action}
              onChange={(e) => onUpdate({ action: e.target.value as StepAction })}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  [{opt.category}] {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic params */}
          <StepParamFields
            action={step.action}
            params={step.params}
            onChange={(params) => onUpdate({ params })}
          />
        </div>
      )}
    </div>
  );
}

function StepParamFields({
  action,
  params,
  onChange,
}: {
  action: StepAction;
  params: Record<string, unknown>;
  onChange: (p: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...params, [key]: value });

  const SelectorField = () => (
    <Field label="セレクタ">
      <input
        type="text"
        value={String(params.selector ?? "")}
        onChange={(e) => set("selector", e.target.value)}
        className="field-input"
        placeholder="CSS セレクタ or XPath"
      />
    </Field>
  );

  switch (action) {
    case "navigate":
      return (
        <Field label="URL">
          <input type="text" value={String(params.url ?? "")} onChange={(e) => set("url", e.target.value)} className="field-input" placeholder="https://example.com" />
        </Field>
      );

    case "click":
    case "double_click":
    case "right_click":
    case "clear":
    case "check":
    case "uncheck":
    case "scroll_to_element":
    case "assert_visible":
    case "assert_hidden":
      return <SelectorField />;

    case "input":
      return (
        <>
          <SelectorField />
          <Field label="入力値">
            <input type="text" value={String(params.value ?? "")} onChange={(e) => set("value", e.target.value)} className="field-input" placeholder="入力するテキスト (変数: {{VAR_NAME}})" />
          </Field>
          <Field label="">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!params.secret} onChange={(e) => set("secret", e.target.checked)} />
              シークレット (ログに表示しない)
            </label>
          </Field>
        </>
      );

    case "select":
      return (
        <>
          <SelectorField />
          <Field label="選択値">
            <input type="text" value={String(params.value ?? "")} onChange={(e) => set("value", e.target.value)} className="field-input" placeholder="option value" />
          </Field>
        </>
      );

    case "scroll":
      return (
        <Field label="スクロール量 (px)">
          <input type="number" value={Number(params.y ?? 0)} onChange={(e) => set("y", Number(e.target.value))} className="field-input" />
        </Field>
      );

    case "assert_text":
      return (
        <>
          <SelectorField />
          <Field label="期待するテキスト">
            <input type="text" value={String(params.expected ?? "")} onChange={(e) => set("expected", e.target.value)} className="field-input" />
          </Field>
          <Field label="マッチモード">
            <select value={String(params.mode ?? "contains")} onChange={(e) => set("mode", e.target.value)} className="field-input">
              <option value="contains">contains (部分一致)</option>
              <option value="exact">exact (完全一致)</option>
              <option value="regex">regex (正規表現)</option>
            </select>
          </Field>
        </>
      );

    case "assert_url":
      return (
        <>
          <Field label="期待するURL">
            <input type="text" value={String(params.expected ?? "")} onChange={(e) => set("expected", e.target.value)} className="field-input" />
          </Field>
          <Field label="マッチモード">
            <select value={String(params.mode ?? "contains")} onChange={(e) => set("mode", e.target.value)} className="field-input">
              <option value="contains">contains</option>
              <option value="exact">exact</option>
            </select>
          </Field>
        </>
      );

    case "assert_attribute":
      return (
        <>
          <SelectorField />
          <Field label="属性名">
            <input type="text" value={String(params.attribute ?? "")} onChange={(e) => set("attribute", e.target.value)} className="field-input" placeholder="href, class, data-testid ..." />
          </Field>
          <Field label="期待値">
            <input type="text" value={String(params.expected ?? "")} onChange={(e) => set("expected", e.target.value)} className="field-input" />
          </Field>
        </>
      );

    case "assert_count":
      return (
        <>
          <SelectorField />
          <Field label="期待する要素数">
            <input type="number" value={Number(params.expected ?? 1)} onChange={(e) => set("expected", Number(e.target.value))} className="field-input" min={0} />
          </Field>
        </>
      );

    case "wait":
      return (
        <Field label="待機時間 (ms)">
          <input type="number" value={Number(params.ms ?? 1000)} onChange={(e) => set("ms", Number(e.target.value))} className="field-input" min={100} step={100} />
        </Field>
      );

    case "wait_for_element":
      return (
        <>
          <SelectorField />
          <Field label="状態">
            <select value={String(params.state ?? "visible")} onChange={(e) => set("state", e.target.value)} className="field-input">
              <option value="visible">visible</option>
              <option value="hidden">hidden</option>
              <option value="attached">attached</option>
            </select>
          </Field>
        </>
      );

    case "screenshot":
      return (
        <>
          <Field label="名前 (任意)">
            <input type="text" value={String(params.name ?? "")} onChange={(e) => set("name", e.target.value)} className="field-input" placeholder="例: ログイン後の画面" />
          </Field>
          <Field label="">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!params.visual_regression} onChange={(e) => set("visual_regression", e.target.checked)} />
              ビジュアルリグレッション比較を有効化
            </label>
          </Field>
        </>
      );

    case "set_variable":
      return (
        <>
          <Field label="変数名">
            <input type="text" value={String(params.name ?? "")} onChange={(e) => set("name", e.target.value)} className="field-input" placeholder="例: USER_TOKEN" />
          </Field>
          <Field label="値">
            <input type="text" value={String(params.value ?? "")} onChange={(e) => set("value", e.target.value)} className="field-input" />
          </Field>
        </>
      );

    case "extract_text":
      return (
        <>
          <SelectorField />
          <Field label="保存先変数名">
            <input type="text" value={String(params.variable ?? "")} onChange={(e) => set("variable", e.target.value)} className="field-input" placeholder="例: EXTRACTED_TEXT" />
          </Field>
        </>
      );

    case "api_request":
      return (
        <>
          <Field label="メソッド">
            <select value={String(params.method ?? "GET")} onChange={(e) => set("method", e.target.value)} className="field-input">
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="URL">
            <input type="text" value={String(params.url ?? "")} onChange={(e) => set("url", e.target.value)} className="field-input" placeholder="https://api.example.com/endpoint" />
          </Field>
          <Field label="レスポンスを変数に保存 (任意)">
            <input type="text" value={String(params.variable ?? "")} onChange={(e) => set("variable", e.target.value)} className="field-input" placeholder="例: API_RESPONSE" />
          </Field>
        </>
      );

    default:
      return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>}
      {children}
      <style jsx global>{`
        .field-input {
          width: 100%;
          padding: 6px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          background: white;
          outline: none;
        }
        .field-input:focus {
          ring: 2px;
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }
      `}</style>
    </div>
  );
}
