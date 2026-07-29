export default function AdminLoading() {
  return (
    <div className="space-y-7" aria-busy="true" aria-live="polite">
      <div className="h-8 w-64 animate-pulse rounded-[var(--radius-md)] bg-[rgba(var(--lumeo-paper-rgb),0.08)]" />
      <div className="h-32 animate-pulse rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)]" />
      <div className="h-64 animate-pulse rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)]" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
