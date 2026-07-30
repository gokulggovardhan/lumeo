"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Tile } from "@/lib/tools/tiles";

// The only part of the command palette that loads on every public page.
// This component's own code is a global keydown listener plus a few
// bytes of state -- CommandPaletteDialog (the search index, result
// list, and all its keyboard/ARIA logic) is dynamically imported and
// stays out of the initial bundle entirely until the user actually
// opens the palette.
const CommandPaletteDialog = dynamic(
  () => import("@/components/CommandPaletteDialog").then((mod) => mod.CommandPaletteDialog),
  { ssr: false },
);

export function CommandPaletteTrigger({ tiles }: { tiles: Tile[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isCommandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isCommandK) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Desktop-only launcher per this PR's "Optional launcher button in
          header (desktop only if appropriate)" -- on mobile there's no
          physical Cmd/Ctrl key to advertise, and header space is already
          tight (logo, PDF Tools menu, Guides/Privacy, Contact, Home), so
          the button would just be one more thing competing for room
          without a keyboard shortcut to actually promote. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette (Ctrl+K)"
        title="Search (Ctrl+K)"
        className="lumeo-press lumeo-focus-ring hidden shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[rgba(var(--paper-rgb),0.07)] px-3 py-2 text-xs font-bold text-[var(--text-secondary)] transition hover:bg-[rgba(var(--paper-rgb),0.12)] hover:text-[var(--text-primary)] md:inline-flex"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
        </svg>
        <kbd className="text-[var(--text-subtle)]">Ctrl K</kbd>
      </button>
      {open ? <CommandPaletteDialog tiles={tiles} onClose={() => setOpen(false)} triggerRef={buttonRef} /> : null}
    </>
  );
}
