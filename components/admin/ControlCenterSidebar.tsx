"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { adminNavigation, isActiveAdminRoute } from "@/lib/admin/navigation";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterSidebar({
  email,
  role,
}: {
  email: string | null;
  role: AdminRole;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(25,48,77,0.9),rgba(16,29,49,0.96))] p-4 shadow-[var(--shadow-lg)] lg:flex lg:flex-col">
      <Link
        href="/admin"
        className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
      >
        <BrandLockup markSize="h-10 w-10" />
      </Link>

      <div className="mt-7">
        <p className="aura-text-label px-3 text-[var(--lumeo-gold-300)]">
          Control Center
        </p>
        <nav className="mt-3 space-y-1.5" aria-label="Control Center navigation">
          {adminNavigation.map((item) => {
            const active = isActiveAdminRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)] ${
                  active
                    ? "border-[rgba(var(--lumeo-seal-rgb),0.5)] bg-[rgba(var(--lumeo-seal-rgb),0.18)] text-[var(--lumeo-paper-50)] shadow-[var(--shadow-xs)]"
                    : "border-transparent text-[var(--lumeo-paper-400)] hover:border-[var(--border-subtle)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.055)] hover:text-[var(--lumeo-paper-50)]"
                }`}
              >
                <AdminIcon name={item.icon} className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-4">
        <p className="text-xs font-semibold text-[var(--lumeo-paper-400)]">Signed in as</p>
        <p className="mt-1 truncate text-sm font-bold text-[var(--lumeo-paper-50)]">
          {email || "Administrator"}
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--lumeo-gold-300)]">
          {role}
        </p>
        <div className="mt-4">
          <AdminSignOutButton />
        </div>
      </div>
    </aside>
  );
}
