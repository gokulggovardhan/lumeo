import type { ReactNode } from "react";
import { ControlCenterMobileNav } from "@/components/admin/ControlCenterMobileNav";
import { ControlCenterSidebar } from "@/components/admin/ControlCenterSidebar";
import { InboxCountProvider } from "@/components/admin/InboxCountBadge";
import { AdminSessionBoundary } from "@/components/admin/AdminSessionBoundary";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterShell({
  children,
  email,
  role,
  unreadInboxCount = 0,
}: {
  children: ReactNode;
  email: string | null;
  role: AdminRole;
  unreadInboxCount?: number;
}) {
  return (
    <AdminSessionBoundary>
      <main className="admin-control-center min-h-dvh bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[8%] top-[10%] h-64 w-64 rounded-full bg-[rgba(var(--lumeo-aura-rgb),0.14)] blur-3xl" />
        <div className="absolute bottom-[12%] right-[8%] h-72 w-72 rounded-full bg-[rgba(var(--lumeo-seal-rgb),0.12)] blur-3xl" />
      </div>
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-5 lg:px-6"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <InboxCountProvider initialCount={unreadInboxCount}>
          <ControlCenterSidebar email={email} role={role} />
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ControlCenterMobileNav email={email} role={role} />
            <div id="main-content" className="mt-4 min-w-0 flex-1 rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-4 shadow-[var(--shadow-lg)] sm:p-6 lg:mt-0 lg:p-7">
              {children}
            </div>
          </section>
        </InboxCountProvider>
      </div>
      </main>
    </AdminSessionBoundary>
  );
}
