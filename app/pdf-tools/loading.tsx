export default function PdfToolsLoading() {
  return (
    <main className="min-h-dvh bg-[var(--surface-canvas)] px-5 py-8 text-[var(--text-primary)] sm:px-8">
      <div className="mx-auto max-w-[1160px]">
        <div className="h-6 w-36 rounded-full bg-[rgba(var(--lumeo-paper-rgb),0.1)]" />
        <div className="mt-5 h-12 w-full max-w-xl rounded-2xl bg-[rgba(var(--lumeo-paper-rgb),0.1)]" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-40 rounded-[22px] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]" />
          ))}
        </div>
      </div>
    </main>
  );
}
