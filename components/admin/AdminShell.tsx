import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/BrandMark";
import { AdminSignOutButton } from "@/components/admin/AdminSignOutButton";

const navItems = [
  { label: "Overview", active: true },
  { label: "Analytics", active: false },
  { label: "PDF Tools", active: false },
  { label: "System", active: false },
];

export function AdminShell({
  children,
  email,
  role,
}: {
  children: ReactNode;
  email: string | null;
  role: string;
}) {
  return (
    <main className="min-h-dvh bg-[#0C1220] text-[#F0EAD6]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col px-4 py-4 sm:px-6 lg:flex-row lg:gap-5 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-2xl border border-[#E8DFC8]/10 bg-[#111A2B] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] lg:flex lg:flex-col">
          <Link href="/" className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45">
            <BrandLockup markSize="h-10 w-10" />
          </Link>

          <div className="mt-8">
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]/70">
              Control Center
            </p>
            <nav className="mt-3 space-y-2" aria-label="Admin navigation">
              {navItems.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm ${
                    item.active
                      ? "border-[#1E6B4A]/55 bg-[#1E6B4A]/18 text-[#F0EAD6]"
                      : "border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.025] text-[#F0EAD6]/52"
                  }`}
                >
                  <span className="font-semibold">{item.label}</span>
                  {!item.active && (
                    <span className="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[#CBA052]/58">
                      Coming next
                    </span>
                  )}
                </div>
              ))}
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

        <section className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
          <header className="flex items-center justify-between gap-3 rounded-2xl border border-[#E8DFC8]/10 bg-[#111A2B]/88 px-4 py-3 lg:hidden">
            <BrandLockup markSize="h-9 w-9" />
            <AdminSignOutButton />
          </header>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:hidden">
            {navItems.map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border px-3 py-2 text-xs ${
                  item.active
                    ? "border-[#1E6B4A]/55 bg-[#1E6B4A]/18 text-[#F0EAD6]"
                    : "border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.025] text-[#F0EAD6]/54"
                }`}
              >
                <span className="font-semibold">{item.label}</span>
                {!item.active && <span className="ml-2 text-[#CBA052]/62">Soon</span>}
              </div>
            ))}
          </div>

          <div className="mt-4 flex-1 rounded-2xl border border-[#E8DFC8]/10 bg-[#111A2B] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] sm:p-7 lg:mt-0">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
