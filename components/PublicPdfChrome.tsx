import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { PdfToolSwitcher } from "@/components/pdf/PdfToolSwitcher";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#C9A84C]/28 bg-[#F0EAD6] p-0.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)]">
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
  const primaryText = tone === "dark" ? "text-[#1C1710]" : "text-[#F0EAD6]";
  const secondaryText =
    tone === "dark" ? "text-[#1E6B4A]" : "text-[#F0EAD6]/54";

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg border border-[#C9A84C]/28 bg-[#F0EAD6] p-0.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${markSize}`}
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
          className={`block font-serif text-[1.35rem] leading-none tracking-[-0.02em] ${primaryText}`}
        >
          Lumeo
        </span>
        <span
          className={`mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.19em] ${secondaryText}`}
        >
          PDF Workspace
        </span>
      </span>
    </span>
  );
}

export function PublicNav({ maxWidth = "max-w-[1360px]" }: { maxWidth?: string }) {
  return (
    <nav className="border-b border-[#E8DFC8]/12 px-5 py-2 sm:px-8">
      <div className={`mx-auto flex ${maxWidth} items-center justify-between gap-4`}>
        <Link href="/" className="flex min-w-0 items-center">
          <BrandLockup markSize="h-9 w-9 sm:h-10 sm:w-10" />
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <PdfToolSwitcher />
          <Link
            href="/"
            aria-label="Go to Lumeo PDF home"
            title="Home"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#E8DFC8]/16 px-3 text-[#F0EAD6]/62 transition hover:border-[#E8DFC8]/32 hover:bg-[#F0EAD6]/[0.035] hover:text-[#F0EAD6] sm:h-11 sm:px-3.5"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
            >
              <path
                d="m5 11 7-6 7 6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M7.5 10.5v7.2h9v-7.2"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
            <span className="hidden text-xs font-semibold sm:inline">Home</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function PublicPageShell({
  children,
  maxWidth = "max-w-[1360px]",
  contentClassName = "px-5 py-8 sm:px-8 lg:py-10",
  mainClassName = "min-h-screen bg-[#0C1220] text-[#F0EAD6]",
}: {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  mainClassName?: string;
}) {
  return (
    <main className={mainClassName}>
      <PublicNav maxWidth={maxWidth} />
      <div className={`mx-auto ${maxWidth} ${contentClassName}`}>
        {children}
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
      mainClassName="min-h-screen bg-[#0C1220] text-[#F0EAD6] lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden"
      contentClassName="px-5 py-8 sm:px-8 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:justify-center lg:overflow-hidden lg:py-6"
    >
      <section className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            PDF workspace
          </p>
          <h1 className="font-serif text-4xl tracking-[-0.02em] text-[#F0EAD6] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#F0EAD6]/55">
            {description}
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFC8]/12 bg-[#1A2840]/72 p-4 text-sm leading-6 text-[#F0EAD6]/52">
          Tool engine coming next. This page is a preview of the document
          workspace layout and does not upload files.
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-dashed border-[#C9A84C]/35 bg-[#F0EAD6] p-7 text-[#1C1710] shadow-2xl shadow-black/20 sm:p-8">
          <div className="mb-4 flex justify-start">
            <BrandLockup tone="dark" markSize="h-10 w-10" />
          </div>
          <h2 className="font-serif text-3xl tracking-[-0.01em]">
            Document tray preview
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#1C1710]/68">
            This workspace will accept {accepted}. The processing engine is
            coming next, so no files are uploaded from this placeholder.
          </p>
          <p className="mt-5 inline-flex rounded-full border border-[#1E6B4A]/20 bg-[#1E6B4A]/10 px-4 py-2 text-xs font-bold text-[#1E6B4A]">
            Tool engine coming next.
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-5 shadow-2xl shadow-black/20">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
            Privacy approach
          </p>
          <p className="mt-4 text-sm font-medium leading-6 text-[#F0EAD6]/50">
            Most tools are designed to run in your browser where possible. If
            server processing is required later, files should be temporary and
            handled with clear deletion rules.
          </p>
        </div>
      </section>
    </PublicPageShell>
  );
}
