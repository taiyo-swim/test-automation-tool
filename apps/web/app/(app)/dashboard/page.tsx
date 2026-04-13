"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Globe, Smartphone, Zap, ChevronRight } from "lucide-react";
import { api } from "../../../lib/api";
import type { Project, Team } from "@e2e-tool/types";

export default function DashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showNewProject, setShowNewProject] = useState(false);

  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get("/teams").then((r) => r.data.data as (Team & { role: string })[]),
  });

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get("/projects").then((r) => r.data.data as Project[]),
  });

  const createProject = useMutation({
    mutationFn: (values: { name: string; platform: string; teamId: string; baseUrl?: string }) =>
      api.post("/projects", values).then((r) => r.data.data as Project),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setShowNewProject(false);
      router.push(`/projects/${project.id}/tests`);
    },
  });

  const platformIcon = (p: string) => {
    if (p === "web") return <Globe size={14} className="text-blue-500" />;
    if (p === "android") return <Smartphone size={14} className="text-green-500" />;
    return <Zap size={14} className="text-orange-500" />;
  };

  const platformLabel = (p: string) =>
    ({ web: "Web", android: "Android", api: "API" })[p] ?? p;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">プロジェクト一覧</h1>
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-1.5 bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus size={15} />
          新規プロジェクト
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      )}

      {!isLoading && (!projectsData || projectsData.length === 0) && (
        <div className="text-center py-16 text-gray-500">
          <Globe size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">プロジェクトがありません</p>
          <p className="text-xs mt-1">「新規プロジェクト」から作成してください</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projectsData?.map((project) => (
          <button
            key={project.id}
            onClick={() => router.push(`/projects/${project.id}/tests`)}
            className="bg-white border border-gray-200 rounded-xl p-5 text-left hover:border-primary-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 mb-3">
                {platformIcon(project.platform)}
                <span className="text-xs text-gray-500 font-medium">{platformLabel(project.platform)}</span>
              </div>
              <ChevronRight size={15} className="text-gray-300 group-hover:text-primary-500 transition-colors mt-0.5" />
            </div>
            <h2 className="font-semibold text-gray-900 text-sm">{project.name}</h2>
            {project.baseUrl && (
              <p className="text-xs text-gray-400 mt-1 truncate">{project.baseUrl}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              {new Date(project.createdAt).toLocaleDateString("ja-JP")}
            </p>
          </button>
        ))}
      </div>

      {showNewProject && teamsData && (
        <NewProjectModal
          teams={teamsData}
          onClose={() => setShowNewProject(false)}
          onCreate={(values) => createProject.mutate(values)}
          loading={createProject.isPending}
        />
      )}
    </div>
  );
}

function NewProjectModal({
  teams,
  onClose,
  onCreate,
  loading,
}: {
  teams: (Team & { role: string })[];
  onClose: () => void;
  onCreate: (v: { name: string; platform: string; teamId: string; baseUrl?: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("web");
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [baseUrl, setBaseUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({ name, platform, teamId, baseUrl: baseUrl || undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">新規プロジェクト作成</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">プロジェクト名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="例: ECサイト E2Eテスト"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">プラットフォーム</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="web">Web</option>
              <option value="android">Android</option>
              <option value="api">API</option>
            </select>
          </div>

          {platform === "web" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ベースURL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://example.com"
              />
            </div>
          )}

          {teams.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">チーム</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
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
              {loading ? "作成中..." : "作成"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
