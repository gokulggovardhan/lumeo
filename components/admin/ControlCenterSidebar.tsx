"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/PublicPdfChrome";
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
    <aside className="hidden w-72 shrink-0 rounded-[1.4rem] border border-[#E8DFC8]/10 bg-[#111A2B] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.24)] lg:flex lg:flex-col">
      <Link
        href="/admin"
        className="rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
      >
        <BrandLockup markSize="h-10 w-10" />
      </Link>

      <div className="mt-7">
        <p className="px-3 text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#CBA052]/70">
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
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/35 ${
                  active
                    ? "border-[#1E6B4A]/55 bg-[#1E6B4A]/18 text-[#F0EAD6]"
                    : "border-transparent text-[#F0EAD6]/58 hover:border-[#E8DFC8]/10 hover:bg-[#F0EAD6]/[0.035] hover:text-[#F0EAD6]"
                }`}
              >
                <AdminIcon name={item.icon} className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/55 p-4">
        <p className="text-xs font-semibold text-[#F0EAD6]/52">Signed in as</p>
        <p className="mt-1 truncate text-sm font-bold text-[#F0EAD6]">
          {email || "Administrator"}
        </p>
        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#CBA052]/68">
          {role}
        </p>
        <div className="mt-4">
          <AdminSignOutButton />
        </div>
      </div>
    </aside>
  );
}
