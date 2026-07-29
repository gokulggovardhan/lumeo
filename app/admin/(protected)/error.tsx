"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin console error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-default)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-6 text-center"
    >
      <p className="text-sm font-semibold text-[var(--lumeo-paper-50)]">Something went wrong</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lumeo-paper-400)]">
        This section of the Control Center failed to load. Your data is safe -- try again, or head back to the dashboard.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-sm font-semibold text-[var(--lumeo-paper-50)] transition duration-200 hover:border-[var(--border-focus)]"
      >
        Try again
      </button>
    </div>
  );
}
