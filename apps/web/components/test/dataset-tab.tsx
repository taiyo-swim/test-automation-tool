"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Database, FileText } from "lucide-react";
import { api } from "../../lib/api";

interface Dataset {
  id: string;
  name: string;
  csvContent: string;
}

interface Props {
  projectId: string;
  testId: string;
}

export function DatasetTab({ projectId, testId }: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ name: string; rows: string[][] } | null>(null);

  const { data: datasets = [] } = useQuery({
    queryKey: ["datasets", testId],
    queryFn: () =>
      api.get(`/projects/${projectId}/tests/${testId}/datasets`).then((r) => r.data.data as Dataset[]),
  });

  const create = useMutation({
    mutationFn: (payload: { name: string; csvContent: string }) =>
      api.post(`/projects/${projectId}/tests/${testId}/datasets`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasets", testId] });
      setPreview(null);
    },
  });

  const remove = useMutation({
    mutationFn: (datasetId: string) =>
      api.delete(`/projects/${projectId}/tests/${testId}/datasets/${datasetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets", testId] }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = text
        .trim()
        .split("\n")
        .map((line) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")));
      setPreview({ name: file.name.replace(/\.csv$/i, ""), rows });
      setUploading(false);
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  const confirmUpload = () => {
    if (!preview) return;
    const csvContent = preview.rows.map((row) => row.join(",")).join("\n");
    create.mutate({ name: preview.name, csvContent });
  };

  const parseRows = (csv: string) =>
    csv
      .trim()
      .split("\n")
      .map((line) => line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">データ駆動テスト</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            CSV の各行のデータで同じテストを繰り返し実行します。
            テストステップ内で <code className="bg-gray-100 px-1 rounded">{"{{列名}}"}</code> として参照できます。
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          <Upload size={13} />
          CSV をアップロード
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview before saving */}
      {preview && (
        <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-blue-600" />
            <span className="text-sm font-medium text-blue-800">{preview.name}.csv — プレビュー</span>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>
                  {preview.rows[0]?.map((h, i) => (
                    <th key={i} className="border border-blue-200 bg-blue-100 px-2 py-1 text-left font-medium text-blue-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(1, 6).map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-blue-200 px-2 py-1 text-gray-700 bg-white">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 7 && (
              <p className="text-xs text-blue-600 mt-1">... 他 {preview.rows.length - 7} 行</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmUpload}
              disabled={create.isPending}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {create.isPending ? "保存中..." : "保存"}
            </button>
            <button
              onClick={() => setPreview(null)}
              className="border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* Dataset list */}
      {datasets.length === 0 && !preview ? (
        <div className="text-center py-10 text-gray-400">
          <Database size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs">データセットがありません</p>
          <p className="text-xs mt-0.5">CSV ファイルをアップロードしてください</p>
        </div>
      ) : (
        <div className="space-y-2">
          {datasets.map((ds) => {
            const rows = parseRows(ds.csvContent);
            const headers = rows[0] ?? [];
            const dataRows = rows.slice(1);
            return (
              <div key={ds.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Database size={14} className="text-gray-400 shrink-0" />
                  <span className="flex-1 text-sm font-medium text-gray-900">{ds.name}</span>
                  <span className="text-xs text-gray-400">{dataRows.length} 行 / {headers.length} 列</span>
                  <button
                    onClick={() => { if (confirm("削除しますか?")) remove.mutate(ds.id); }}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="border-t border-gray-100 px-4 py-2 overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i} className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium text-gray-600">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.slice(0, 4).map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j} className="border border-gray-200 px-2 py-1 text-gray-700">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {dataRows.length > 4 && (
                    <p className="text-xs text-gray-400 mt-1">... 他 {dataRows.length - 4} 行</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
