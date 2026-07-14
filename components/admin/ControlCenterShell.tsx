import type { ReactNode } from "react";
import Link from "next/link";
import { ControlCenterMobileNav } from "@/components/admin/ControlCenterMobileNav";
import { ControlCenterSidebar } from "@/components/admin/ControlCenterSidebar";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterShell({
  children,
  email,
  role,
}: {
  children: ReactNode;
  email: string | null;
  role: AdminRole;
}) {
  return (
    <main className="min-h-dvh bg-[var(--lumeo-ink-950)] text-[var(--lumeo-paper-100)]">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[8%] top-[10%] h-64 w-64 rounded-full bg-[rgba(var(--lumeo-aura-rgb),0.14)] blur-3xl" />
        <div className="absolute bottom-[12%] right-[8%] h-72 w-72 rounded-full bg-[rgba(var(--lumeo-seal-rgb),0.12)] blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-5 lg:px-6">
        <ControlCenterSidebar email={email} role={role} />
        <section className="flex min-h-0 flex-1 flex-col">
          <ControlCenterMobileNav email={email} role={role} />
          <div className="mb-3 hidden justify-end lg:flex">
            <Link
              href="/admin/guide"
              className="rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] px-4 py-2 text-xs font-extrabold text-[var(--lumeo-paper-400)] transition hover:border-[var(--border-premium)] hover:text-[var(--lumeo-paper-50)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)]"
            >
              Control Center guide
            </Link>
          </div>
          <div id="main-content" className="mt-4 flex-1 rounded-[1.4rem] border border-[var(--border-subtle)] bg-[rgba(16,29,49,0.94)] p-4 shadow-[var(--shadow-lg)] sm:p-6 lg:mt-0 lg:p-7">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
