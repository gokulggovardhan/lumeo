"use client";

import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  children,
  pendingLabel = "Saving...",
  disabled = false,
  variant = "primary",
  confirmMessage,
  form,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  /** When set, shows a browser confirm() before the form submits and blocks the submit if declined. */
  confirmMessage?: string;
  /** Associates this button with a <form> elsewhere in the DOM by id, per the HTML5 form attribute -- for tables where every cell in a row needs to submit one shared row-level form. */
  form?: string;
}) {
  const { pending } = useFormStatus();
  const classes =
    variant === "primary"
      ? "border-[rgba(var(--lumeo-seal-rgb),0.6)] bg-[var(--lumeo-seal-600)] text-[var(--lumeo-paper-50)] shadow-[var(--shadow-success)] hover:bg-[var(--lumeo-seal-500)]"
      : variant === "danger"
        ? "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)] hover:brightness-110"
        : "border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.055)] text-[var(--lumeo-paper-50)] hover:border-[var(--border-premium)]";

  return (
    <button
      type="submit"
      form={form}
      disabled={disabled || pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className={`min-h-11 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
