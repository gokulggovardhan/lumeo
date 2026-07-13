"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";
import { adminNavigation, isActiveAdminRoute } from "@/lib/admin/navigation";
import type { AdminRole } from "@/lib/admin/types";

export function ControlCenterMobileNav({
  email,
  role,
}: {
  email: string | null;
  role: AdminRole;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      <div className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-[#E8DFC8]/10 bg-[#111A2B]/94 px-4 py-3">
        <Link href="/admin" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45">
          <BrandLockup markSize="h-9 w-9" />
        </Link>
        <button
          ref={buttonRef}
          type="button"
          aria-label="Open Control Center navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="min-h-11 rounded-xl border border-[#E8DFC8]/12 bg-[#0C1220]/58 px-4 text-sm font-bold text-[#F0EAD6] transition duration-200 hover:border-[#CBA052]/36"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="mt-3 rounded-[1.2rem] border border-[#E8DFC8]/10 bg-[#111A2B] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <div className="mb-3 rounded-xl border border-[#E8DFC8]/8 bg-[#0C1220]/52 p-3">
            <p className="truncate text-sm font-bold text-[#F0EAD6]">{email || "Administrator"}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#CBA052]/68">{role}</p>
          </div>
          <nav className="grid gap-2" aria-label="Mobile Control Center navigation">
            {adminNavigation.map((item) => {
              const active = isActiveAdminRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition duration-200 ${
                    active
                      ? "border-[#1E6B4A]/55 bg-[#1E6B4A]/18 text-[#F0EAD6]"
                      : "border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.025] text-[#F0EAD6]/62"
                  }`}
                >
                  <AdminIcon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-3">
            <AdminSignOutButton />
          </div>
        </div>
      )}
    </header>
  );
}
