"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, LogOut } from "lucide-react";
import { useAuthStore } from "../../lib/auth-store";
import clsx from "clsx";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const navItems = [
    { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  ];

  return (
    <aside className="w-56 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-200">
        <span className="font-bold text-gray-900 text-base">E2E Test Tool</span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(item.href)
                ? "bg-primary-50 text-primary-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <item.icon size={16} />
            {item.label}
          </Link>
        ))}
      </nav>

      {user && (
        <div className="px-3 py-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
              {user.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">{user.name}</p>
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
          >
            <LogOut size={13} />
            ログアウト
          </button>
        </div>
      )}
    </aside>
  );
}
