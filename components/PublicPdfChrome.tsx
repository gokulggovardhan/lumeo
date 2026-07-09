import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#C9A84C]/35 bg-[#1E6B4A] shadow-[0_10px_30px_rgba(0,0,0,0.22)]">
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

export function LumeoLogoLight({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/lumeo-pdf-logo-light.png"
      alt="Lumeo PDF Workspace"
      width={1916}
      height={821}
      className={className}
      priority
    />
  );
}

export function LumeoLogoDark({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/brand/lumeo-pdf-logo-dark.png"
      alt="Lumeo PDF Workspace"
      width={1916}
      height={821}
      className={className}
    />
  );
}

export function PublicNav({ maxWidth = "max-w-[1100px]" }: { maxWidth?: string }) {
  return (
    <nav className="border-b border-[#E8DFC8]/12 px-5 py-4 sm:px-8">
      <div className={`mx-auto flex ${maxWidth} items-center justify-between gap-4`}>
        <Link href="/" className="flex min-w-0 items-center">
          <LumeoLogoLight className="h-9 w-auto max-w-[168px] object-contain sm:max-w-[190px]" />
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
          <div className="mx-auto mb-5 flex justify-center">
            <LumeoLogoDark className="h-11 w-auto max-w-[220px] object-contain" />
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
