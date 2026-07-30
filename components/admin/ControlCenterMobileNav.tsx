"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { InboxCountBadge } from "@/components/admin/InboxCountBadge";
import { isActiveAdminRoute, visibleAdminNavigation } from "@/lib/admin/navigation";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterMobileNav({
  email,
  role,
  unreadInboxCount = 0,
}: {
  email: string | null;
  role: AdminRole;
  unreadInboxCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const items = visibleAdminNavigation(role);
  const mainItems = items.filter((item) => !item.group);
  const referenceItems = items.filter((item) => item.group === "reference");

  function renderLink(item: (typeof items)[number]) {
    const active = isActiveAdminRoute(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition duration-200 ${
          active
            ? "border-[rgba(var(--lumeo-seal-rgb),0.55)] bg-[rgba(var(--lumeo-seal-rgb),0.18)] text-[var(--lumeo-paper-50)]"
            : "border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] text-[var(--lumeo-paper-400)]"
        }`}
      >
        <AdminIcon name={item.icon} className="h-4 w-4" />
        {item.label}
        {item.href === "/admin/inbox" ? <InboxCountBadge initialCount={unreadInboxCount} /> : null}
      </Link>
    );
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <header className="lg:hidden">
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <Link href="/admin" className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">
          <BrandLockup markSize="h-9 w-9" />
        </Link>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Open Control Center navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] px-4 text-sm font-bold text-[var(--lumeo-paper-50)] transition duration-200 hover:border-[var(--border-premium)]"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="aura-drawer-enter mt-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3 shadow-[var(--shadow-lg)]">
          <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-3">
            <p className="truncate text-sm font-bold text-[var(--lumeo-paper-50)]">{email || "Administrator"}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--lumeo-gold-300)]">{role}</p>
          </div>
          <nav className="grid gap-2" aria-label="Mobile Control Center navigation">
            {mainItems.map(renderLink)}
          </nav>
          {referenceItems.length > 0 && (
            <>
              <p className="aura-text-label mt-3 px-3 text-[var(--lumeo-paper-400)]/70">
                Reference
              </p>
              <nav className="mt-2 grid gap-2" aria-label="Reference navigation">
                {referenceItems.map(renderLink)}
              </nav>
            </>
          )}
          <div className="mt-3">
            <AdminSignOutButton />
          </div>
        </div>
      )}
    </header>
  );
}
