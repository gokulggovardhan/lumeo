"use client";

import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/BrandMark";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { InboxCountBadge } from "@/components/admin/InboxCountBadge";
import { groupedAdminNavigation, isActiveAdminRoute } from "@/lib/admin/navigation";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterSidebar({
  email,
  role,
}: {
  email: string | null;
  role: AdminRole;
}) {
  const pathname = usePathname();
  const groups = groupedAdminNavigation(role);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[17.5rem] shrink-0 border-r border-[var(--border-hairline)] bg-[rgba(17,19,16,0.78)] px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
      <a
        href="/admin"
        className="rounded-xl px-2 py-1.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-gold-rgb),0.16)]"
        aria-label="Lumeo Admin Dashboard"
      >
        <BrandLockup markSize="h-9 w-9" />
      </a>

      <div className="mt-7 flex-1 overflow-y-auto pr-1">
        <p className="px-3 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--text-subtle)]">
          Admin Console
        </p>

        <nav className="mt-4 space-y-6" aria-label="Admin navigation">
          {groups.map((group) => (
            <div key={group.id}>
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--text-subtle)]/80">
                {group.label}
              </p>
              <div className="mt-2 space-y-1">
                {group.items.map((item) => {
                  const active = isActiveAdminRoute(pathname, item.href);
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-gold-rgb),0.14)] ${
                        active
                          ? "bg-[rgba(var(--lumeo-seal-rgb),0.13)] text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.04)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {active ? (
                        <span
                          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--lumeo-gold-400)]"
                          aria-hidden="true"
                        />
                      ) : null}
                      <AdminIcon
                        name={item.icon}
                        className={`h-4 w-4 shrink-0 ${active ? "text-[var(--text-accent)]" : "text-[var(--text-subtle)] group-hover:text-[var(--text-secondary)]"}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.href === "/admin/inbox" ? <InboxCountBadge /> : null}
                    </a>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
        <div className="rounded-xl bg-[rgba(var(--lumeo-paper-rgb),0.035)] p-3">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {email || "Administrator"}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-accent)]">
              {role}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-subtle)]">
              secure
            </span>
          </div>
          <div className="mt-3">
            <AdminSignOutButton />
          </div>
        </div>
      </div>
    </aside>
  );
}
