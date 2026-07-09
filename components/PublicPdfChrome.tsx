import Link from "next/link";
import type { ReactNode } from "react";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#C9A84C]/35 bg-[#1E6B4A] text-[#F0EAD6] shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M12 4.5 18 7v5.2c0 3.45-2.45 6.2-6 7.3-3.55-1.1-6-3.85-6-7.3V7l6-2.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="m9.2 12.1 1.8 1.8 3.9-4.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

export function PublicNav({ maxWidth = "max-w-[1100px]" }: { maxWidth?: string }) {
  return (
    <nav className="border-b border-[#E8DFC8]/12 px-5 py-4 sm:px-8">
      <div className={`mx-auto flex ${maxWidth} items-center justify-between gap-4`}>
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <LumeoSealMark />
          <span className="truncate text-sm font-semibold tracking-tight text-[#F0EAD6]">
            Lumeo PDF Workspace
          </span>
        </Link>

        <Link
          href="/"
          className="rounded-full border border-[#E8DFC8]/16 px-4 py-2 text-xs font-semibold text-[#F0EAD6]/58 transition hover:border-[#E8DFC8]/32 hover:text-[#F0EAD6]"
        >
          Back to Lumeo PDF
        </Link>
      </div>
    </nav>
  );
}

export function PublicPageShell({
  children,
  maxWidth = "max-w-[1100px]",
}: {
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
      <PublicNav maxWidth={maxWidth} />
      <div className={`mx-auto ${maxWidth} px-5 py-16 sm:px-8`}>{children}</div>
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
    <PublicPageShell maxWidth="max-w-[900px]">
      <section>
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          PDF workspace
        </p>
        <h1 className="font-serif text-4xl tracking-[-0.02em] text-[#F0EAD6] sm:text-6xl">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-[#F0EAD6]/55">
          {description}
        </p>
      </section>

      <section className="mt-12 rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840] p-5 shadow-2xl shadow-black/20 sm:p-8">
        <div className="rounded-xl border border-dashed border-[#C9A84C]/35 bg-[#F0EAD6] p-8 text-center text-[#1C1710] sm:p-12">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#C9A84C]/45 bg-[#E8DFC8] text-[#1E6B4A]">
            <LumeoSealMark />
          </div>
          <h2 className="font-serif text-3xl tracking-[-0.01em]">
            Document tray preview
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#1C1710]/68">
            This workspace will accept {accepted}. The processing engine is
            coming next, so no files are uploaded from this placeholder.
          </p>
          <p className="mx-auto mt-6 inline-flex rounded-full border border-[#1E6B4A]/20 bg-[#1E6B4A]/10 px-4 py-2 text-xs font-bold text-[#1E6B4A]">
            Tool engine coming next.
          </p>
        </div>
        <p className="mt-5 text-sm font-medium leading-6 text-[#F0EAD6]/50">
          Privacy note: Most tools are designed to run in your browser where
          possible. If server processing is required later, files should be
          temporary and handled with clear deletion rules.
        </p>
      </section>
    </PublicPageShell>
  );
}
