"use client";

import { useFormStatus } from "react-dom";

export function AdminSubmitButton({
  children,
  pendingLabel = "Saving...",
  disabled = false,
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const classes =
    variant === "primary"
      ? "border-[#1E6B4A]/60 bg-[#1E6B4A] text-[#F0EAD6] hover:bg-[#257B57]"
      : "border-[#E8DFC8]/14 bg-[#F0EAD6]/[0.035] text-[#F0EAD6] hover:border-[#CBA052]/35";

  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
