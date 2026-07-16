import type { ReactNode } from "react";

export function AdminFormField({
  label,
  name,
  defaultValue,
  type = "text",
  help,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: "text" | "number" | "datetime-local" | "email" | "url";
  help?: string;
  children?: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--lumeo-paper-50)]">
      {label}
      {children ?? (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          className="mt-2 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--lumeo-paper-50)] outline-none transition duration-200 placeholder:text-[var(--lumeo-paper-600)] focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--lumeo-aura-rgb),0.16)]"
        />
      )}
      {help && <span className="mt-1 block text-xs font-normal text-[var(--lumeo-paper-400)]">{help}</span>}
    </label>
  );
}
