import type { ReactNode } from "react";
import { ControlCenterShell } from "@/components/admin/ControlCenterShell";
import { requireAdmin } from "@/lib/admin/auth";
import { getUnreadInboxCount } from "@/lib/admin/data";

export const metadata = {
  title: "Lumeo Control Center",
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = "force-dynamic";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requireAdmin();
  const unreadInbox = await getUnreadInboxCount();

  return (
    <ControlCenterShell email={admin.email} role={admin.role} unreadInboxCount={unreadInbox.data}>
      {children}
    </ControlCenterShell>
  );
}
