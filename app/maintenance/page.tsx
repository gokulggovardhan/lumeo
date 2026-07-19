import type { Metadata } from "next";
import { BrandLockup } from "@/components/BrandMark";
import { getPublicMaintenanceStatus } from "@/lib/public-site/maintenance";

export const metadata: Metadata = {
  title: "Under maintenance",
  description: "Lumeo PDF is briefly offline for maintenance.",
  robots: { index: false, follow: false },
};

function ToolIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 text-[var(--text-accent)]" fill="none">
      <path
        d="M16 4a12 12 0 1 0 8.49 20.49"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M16 9v7l5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 4v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function MaintenancePage() {
  const status = await getPublicMaintenanceStatus();
  const title = status.title ?? "Under maintenance";
  const message =
    status.message ?? "We're making some improvements to Lumeo PDF. We'll be back shortly.";

  return (
    <main className="lumeo-page-enter relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--surface-canvas)] px-5 py-16 text-center text-[var(--text-primary)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-52 h-[30rem] w-[30rem] rounded-full bg-[rgba(var(--atelier-sage-rgb),0.06)] blur-[60px] md:blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-[-5rem] h-[28rem] w-[28rem] rounded-full bg-[rgba(var(--atelier-brass-rgb),0.05)] blur-[60px] md:blur-[150px] [animation-delay:-4s]" />
      </div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <BrandLockup markSize="h-11 w-11" />

        <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(var(--atelier-sage-rgb),0.2)] bg-[rgba(var(--atelier-sage-rgb),0.13)]">
          <ToolIcon />
        </div>

        <h1 className="mt-6 font-serif font-semibold text-[clamp(1.6rem,4vw,2.25rem)] leading-tight text-[var(--text-primary)]">
          {title}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-[var(--text-secondary)] sm:text-base">
          {message}
        </p>

        <p className="aura-text-label mt-8 inline-flex items-center gap-2 text-[var(--text-accent)]">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--text-accent)]" />
          Files on this device were never uploaded anywhere — nothing to worry about while we&apos;re offline.
        </p>
      </div>
    </main>
  );
}
