import type { ReactNode } from "react";
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
    <main className="min-h-dvh bg-[#0C1220] text-[#F0EAD6]">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute left-[8%] top-[10%] h-64 w-64 rounded-full bg-[#0D2C6D]/20 blur-3xl" />
        <div className="absolute bottom-[12%] right-[8%] h-72 w-72 rounded-full bg-[#1E6B4A]/10 blur-3xl" />
      </div>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:gap-5 lg:px-6">
        <ControlCenterSidebar email={email} role={role} />
        <section className="flex min-h-0 flex-1 flex-col">
          <ControlCenterMobileNav email={email} role={role} />
          <div className="mt-4 flex-1 rounded-[1.4rem] border border-[#E8DFC8]/10 bg-[#0F1828]/96 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-6 lg:mt-0 lg:p-7">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
