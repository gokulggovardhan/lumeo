// components/PublicPdfChrome.tsx

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PdfToolSwitcher } from "@/components/pdf/PdfToolSwitcher";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#F0EAD6] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
      <Image
        src="/brand/lumeo-pdf-mark.png"
        alt=""
        width={36}
        height={36}
        className="h-full w-full object-contain"
        priority
      />
    </span>
  );
}

export function BrandLockup({
  tone = "light",
  markSize = "h-9 w-9",
}: {
  tone?: "light" | "dark";
  markSize?: string;
}) {
  const primaryText = tone === "dark" ? "text-[#151A22]" : "text-[#F0EAD6]";
  const secondaryText =
    tone === "dark" ? "text-[#1E6B4A]" : "text-[#CBA052]/72";

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg border border-[#CBA052]/22 bg-[#F0EAD6] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${markSize}`}
      >
        <Image
          src="/brand/lumeo-pdf-mark.png"
          alt=""
          width={40}
          height={40}
          className="h-full w-full object-contain"
          priority
        />
      </span>

      <span className="min-w-0 leading-none">
        <span
          className={`block text-[1.25rem] font-bold leading-none tracking-[-0.025em] ${primaryText}`}
        >
          Lumeo
        </span>
        <span
          className={`mt-1 block text-[0.54rem] font-bold uppercase tracking-[0.19em] ${secondaryText}`}
        >
          PDF Workspace
        </span>
      </span>
    </span>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[1.05rem] w-[1.05rem]" fill="none">
      <path d="m5 11 7-6 7 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
      <path d="M7.5 10.5v7.2h9v-7.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
    </svg>
  );
}

export function PublicNav({ maxWidth = "max-w-[1160px]" }: { maxWidth?: string }) {
  return (
    <nav className="lumeo-nav-enter relative z-30 border-b border-[#E8DFC8]/8 bg-[#0C1220]/92 px-5 backdrop-blur-xl sm:px-8">
      <div className={`mx-auto flex h-[70px] ${maxWidth} items-center justify-between gap-4`}>
        <Link href="/" className="flex min-w-0 items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45">
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <PdfToolSwitcher />
          <Link
            href="/"
            aria-label="Go to Lumeo PDF home"
            title="Home"
            className="lumeo-press lumeo-focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.02] text-[#F0EAD6]/64 transition hover:border-[#CBA052]/28 hover:bg-[#CBA052]/[0.08] hover:text-[#D8BC7A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 sm:h-11 sm:w-11"
          >
            <HomeIcon />
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicPageShell({
  children,
  maxWidth = "max-w-[1160px]",
  contentClassName = "px-5 py-8 sm:px-8 lg:py-10",
  mainClassName = "min-h-screen bg-[#0C1220] text-[#F0EAD6]",
}: {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  mainClassName?: string;
}) {
  return (
    <main className={`lumeo-page-enter relative overflow-x-hidden ${mainClassName}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="lumeo-ambient absolute -left-44 -top-48 h-[32rem] w-[32rem] rounded-full bg-[#0D2C6D]/20 blur-[150px]" />
        <div className="lumeo-ambient absolute -right-44 top-0 [animation-delay:-4s] h-[30rem] w-[30rem] rounded-full bg-[#CBA052]/[0.06] blur-[155px]" />
      </div>

      <div className="relative z-10">
        <PublicNav maxWidth={maxWidth} />
        <div className={`mx-auto ${maxWidth} ${contentClassName}`}>{children}</div>
      </div>
    </main>
  );
}

export function ToolPlaceholder({
  title,
  description,
  accepted,
}: {
  title: string;
  description: string;
  accepted: string;
}) {
  return (
    <PublicPageShell
      mainClassName="min-h-dvh bg-[#0C1220] text-[#F0EAD6]"
      contentClassName="px-5 py-14 sm:px-8 sm:py-20"
      maxWidth="max-w-[820px]"
    >
      <section className="mx-auto text-center">
        <p className="text-[0.64rem] font-bold uppercase tracking-[0.2em] text-[#CBA052]">
          Coming next
        </p>
        <h1 className="mt-4 text-4xl font-bold tracking-[-0.04em] text-[#F0EAD6] sm:text-6xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[#F0EAD6]/60 sm:text-lg sm:leading-8">
          {description}
        </p>

        <div className="mx-auto mt-10 max-w-2xl rounded-[24px] border border-[#E8DFC8]/8 bg-[#111A2B]/92 px-6 py-8 shadow-[0_30px_90px_rgba(0,0,0,0.35)] sm:px-8">
          <p className="text-xl font-bold text-[#F0EAD6]">This workspace is being prepared.</p>
          <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/54">Accepted format: {accepted}</p>
          <p className="mt-5 text-xs font-semibold text-[#9FD0B5]">Private by design · Browser-first where possible</p>
        </div>
      </section>
    </PublicPageShell>
  );
}
