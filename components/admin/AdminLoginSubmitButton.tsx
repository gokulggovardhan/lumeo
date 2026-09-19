"use client";

import { useFormStatus } from "react-dom";

export function AdminLoginSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="inline-flex h-12 w-full touch-manipulation items-center justify-center rounded-xl bg-[#1E6B4A] px-5 text-sm font-bold text-[#F0EAD6] shadow-[0_14px_34px_rgba(30,107,74,0.24)] transition hover:bg-[#257A56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 disabled:cursor-wait disabled:opacity-65"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
