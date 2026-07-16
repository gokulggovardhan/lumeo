import { L2SkeletonCard } from "@/components/ui/Aura";

export default function PdfToolsLoading() {
  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] px-5 py-8 text-[var(--text-primary)] sm:px-8">
      <div className="mx-auto max-w-[1160px]">
        <div className="aura-shimmer h-6 w-36 rounded-[var(--radius-pill)] bg-[rgba(var(--paper-rgb),0.1)]" />
        <div className="aura-shimmer mt-5 h-12 w-full max-w-xl rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.1)]" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <L2SkeletonCard key={item} />
          ))}
        </div>
      </div>
    </main>
  );
}
