import type { ReactNode } from "react";
import { ControlCenterShell } from "@/components/admin/ControlCenterShell";
import { requireAdmin } from "@/lib/admin/auth";

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

  return (
    <ControlCenterShell email={admin.email} role={admin.role}>
      {children}
    </ControlCenterShell>
  );
}
