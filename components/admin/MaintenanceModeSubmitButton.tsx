"use client";

import { useFormStatus } from "react-dom";

export function MaintenanceModeSubmitButton({
  wasEnabled,
}: {
  wasEnabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        const form = event.currentTarget.form;
        const toggle = form?.elements.namedItem("value");
        const willEnable =
          toggle instanceof HTMLInputElement && toggle.checked;

        if (
          !wasEnabled &&
          willEnable &&
          !window.confirm(
            "Enable Maintenance mode? Public Lumeo routes will show the maintenance page until you turn it off.",
          )
        ) {
          event.preventDefault();
        }
      }}
      className="min-h-11 rounded-[var(--radius-md)] border border-[rgba(var(--lumeo-seal-rgb),0.6)] bg-[var(--lumeo-seal-600)] px-4 py-2 text-sm font-bold text-[var(--lumeo-paper-50)] shadow-[var(--shadow-success)] transition duration-200 hover:bg-[var(--lumeo-seal-500)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-45"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}
