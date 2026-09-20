"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export function MaintenanceModeSubmitButton({
  wasEnabled,
}: {
  wasEnabled: boolean;
}) {
  const { pending } = useFormStatus();
  const [confirming, setConfirming] = useState(false);

  function willEnable(form: HTMLFormElement | null) {
    const toggle = form?.elements.namedItem("value");
    return toggle instanceof HTMLInputElement && toggle.checked;
  }

  function submitOrConfirm(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!wasEnabled && willEnable(form)) {
      setConfirming(true);
      return;
    }
    form?.requestSubmit();
  }

  if (confirming) {
    return (
      <>
        <input
          type="hidden"
          name="maintenance_confirmation"
          value="confirm-enable"
        />
        <div
        role="alertdialog"
        aria-labelledby="maintenance-confirm-title"
        aria-describedby="maintenance-confirm-description"
        className="mt-4 rounded-xl border border-[var(--border-danger)] bg-[var(--surface-danger)]/12 p-4"
      >
        <p id="maintenance-confirm-title" className="text-sm font-bold text-[var(--text-danger)]">
          Enable Maintenance mode?
        </p>
        <p id="maintenance-confirm-description" className="mt-2 text-sm leading-6 text-[#F0EAD6]/68">
          Public Lumeo routes will show the maintenance experience until an owner disables this setting. Admin access remains available.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            onClick={(event) => {
              if (!willEnable(event.currentTarget.form)) {
                event.preventDefault();
                setConfirming(false);
              }
            }}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-danger)] bg-[var(--surface-danger)] px-4 py-2 text-sm font-bold text-[var(--text-danger)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-45"
          >
            {pending ? "Enabling..." : "Enable maintenance mode"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--lumeo-paper-100)] transition hover:border-[var(--border-premium)] disabled:opacity-45"
          >
            Cancel
          </button>
        </div>
      </div>
      </>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={submitOrConfirm}
      className="min-h-11 rounded-[var(--radius-md)] border border-[rgba(var(--lumeo-seal-rgb),0.6)] bg-[var(--lumeo-seal-600)] px-4 py-2 text-sm font-bold text-[var(--lumeo-paper-50)] shadow-[var(--shadow-success)] transition duration-200 hover:bg-[var(--lumeo-seal-500)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.18)] active:scale-[0.98] disabled:cursor-wait disabled:opacity-45"
    >
      {pending ? "Saving..." : "Save changes"}
    </button>
  );
}
