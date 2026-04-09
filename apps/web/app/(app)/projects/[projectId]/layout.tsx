"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FlaskConical, Play, Settings, Calendar, Layers, BarChart2 } from "lucide-react";
import { api } from "../../../../lib/api";
import type { Project } from "@e2e-tool/types";
import clsx from "clsx";

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const pathname = usePathname();

  const { data: project } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => api.get(`/projects/${projectId}`).then((r) => r.data.data as Project),
  });

  const tabs = [
    { href: `/projects/${projectId}/tests`, label: "テスト", icon: FlaskConical },
    { href: `/projects/${projectId}/runs`, label: "実行履歴", icon: Play },
    { href: `/projects/${projectId}/schedules`, label: "スケジュール", icon: Calendar },
    { href: `/projects/${projectId}/shared-steps`, label: "共有ステップ", icon: Layers },
    { href: `/projects/${projectId}/analytics`, label: "分析", icon: BarChart2 },
    { href: `/projects/${projectId}/settings`, label: "設定", icon: Settings },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-3">
          <Link href="/dashboard" className="hover:text-gray-700">プロジェクト</Link>
          <ChevronRight size={13} />
          <span className="text-gray-900 font-medium">{project?.name ?? "..."}</span>
        </nav>

        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                pathname.startsWith(tab.href)
                  ? "bg-primary-50 text-primary-700"
                  : "text-gray-600 hover:bg-gray-100"
              )}
            >
              <tab.icon size={14} />
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}
