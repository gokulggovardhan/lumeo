import Image from "next/image";

export function LumeoSealMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--atelier-brass-rgb),0.22)] bg-[var(--atelier-ivory-100)] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
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
  const primaryText = tone === "dark" ? "text-[#151A22]" : "text-[var(--text-primary)]";
  const secondaryText =
    tone === "dark" ? "text-[var(--atelier-sage-600)]" : "text-[var(--text-accent)]";

  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg border border-[rgba(var(--atelier-brass-rgb),0.22)] bg-[var(--atelier-ivory-100)] p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${markSize}`}
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
