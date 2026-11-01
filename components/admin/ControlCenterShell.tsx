import type { ReactNode } from "react";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
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
  environment,
  revision,
}: {
  children: ReactNode;
  email: string | null;
  role: AdminRole;
  unreadInboxCount?: number;
  environment: string;
  revision: string | null;
}) {
  return (
    <AdminSessionBoundary>
      <main className="admin-control-center min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-primary)]">
        <InboxCountProvider initialCount={unreadInboxCount}>
          <div className="mx-auto min-h-dvh w-full max-w-[1800px] lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
            <ControlCenterSidebar email={email} role={role} />

            <div className="min-w-0">
              <ControlCenterMobileNav
                email={email}
                role={role}
                environment={environment}
                revision={revision}
              />
              <AdminTopbar
                email={email}
                role={role}
                environment={environment}
                revision={revision}
              />

              <section
                id="main-content"
                className="min-w-0 px-4 py-5 sm:px-6 sm:py-6 lg:px-7 lg:py-7 xl:px-9 xl:py-8"
                style={{
                  paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
                  paddingLeft: "max(1rem, env(safe-area-inset-left))",
                  paddingRight: "max(1rem, env(safe-area-inset-right))",
                }}
              >
                <div className="mx-auto w-full max-w-[1420px]">{children}</div>
              </section>
            </div>
          </div>
        </InboxCountProvider>
      </main>
    </AdminSessionBoundary>
  );
}
