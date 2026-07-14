export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-6 text-center">
      <p className="text-sm font-semibold text-[var(--lumeo-paper-50)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lumeo-paper-400)]">{description}</p>
    </div>
  );
}
