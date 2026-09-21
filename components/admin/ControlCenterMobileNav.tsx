"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { InboxCountBadge } from "@/components/admin/InboxCountBadge";
import { groupedAdminNavigation, isActiveAdminRoute } from "@/lib/admin/navigation";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterMobileNav({
  email,
  role,
  environment,
  revision,
}: {
  email: string | null;
  role: AdminRole;
  environment: string;
  revision: string | null;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLElement>(null);
  const groups = groupedAdminNavigation(role);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !wrapperRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [open]);

  return (
    <header ref={wrapperRef} className="sticky top-0 z-40 border-b border-[var(--border-hairline)] bg-[rgba(17,19,16,0.9)] backdrop-blur-xl lg:hidden">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4">
        <a
          href="/admin"
          className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-gold-rgb),0.16)]"
          aria-label="Lumeo Admin Dashboard"
        >
          <BrandLockup markSize="h-8 w-8" />
        </a>

        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
            {environment === "production" ? "Production" : environment} · Cloudflare
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-subtle)]">
            {revision ? revision.slice(0, 10) : "revision unavailable"}
          </p>
        </div>

        <button
          ref={buttonRef}
          type="button"
          aria-label={open ? "Close Admin navigation" : "Open Admin navigation"}
          aria-expanded={open}
          aria-controls="admin-mobile-menu"
          onClick={() => setOpen((value) => !value)}
          className="min-h-10 touch-manipulation rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.04)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--border-premium)]"
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open ? (
        <div
          id="admin-mobile-menu"
          className="absolute inset-x-3 top-[calc(100%+0.5rem)] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-[var(--border-default)] bg-[rgba(23,25,22,0.98)] p-3 shadow-[var(--shadow-xl)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border-hairline)] bg-[rgba(var(--lumeo-paper-rgb),0.035)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{email || "Administrator"}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-accent)]">{role}</p>
            </div>
            <a href="/" className="text-xs font-semibold text-[var(--text-secondary)]">
              Site ↗
            </a>
          </div>

          <nav className="space-y-5" aria-label="Mobile Admin navigation">
            {groups.map((group) => (
              <div key={group.id}>
                <p className="px-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[var(--text-subtle)]">
                  {group.label}
                </p>
                <div className="mt-2 grid gap-1.5">
                  {group.items.map((item) => {
                    const active = isActiveAdminRoute(pathname, item.href);
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                          active
                            ? "bg-[rgba(var(--lumeo-seal-rgb),0.14)] text-[var(--text-primary)]"
                            : "text-[var(--text-muted)] hover:bg-[rgba(var(--lumeo-paper-rgb),0.04)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <AdminIcon name={item.icon} className={`h-4 w-4 ${active ? "text-[var(--text-accent)]" : "text-[var(--text-subtle)]"}`} />
                        <span className="flex-1">{item.label}</span>
                        {item.href === "/admin/inbox" ? <InboxCountBadge /> : null}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
            <AdminSignOutButton />
          </div>
        </div>
      ) : null}
    </header>
  );
}
