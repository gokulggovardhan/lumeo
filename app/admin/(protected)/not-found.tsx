import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-6 text-center">
      <p className="text-sm font-semibold text-[var(--lumeo-paper-50)]">Page not found</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lumeo-paper-400)]">
        This Control Center page doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/admin"
        className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-sm font-semibold text-[var(--lumeo-paper-50)] transition duration-200 hover:border-[var(--border-focus)]"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
