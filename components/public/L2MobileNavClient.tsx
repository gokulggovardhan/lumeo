"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

const links = [
  { href: "/pdf-tools", label: "PDF Tools" },
  { href: "/guides", label: "Guides" },
  { href: "/privacy", label: "Privacy" },
];

export function L2MobileNavClient() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handlePointerDown(event: PointerEvent) {
      if (!drawerRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={drawerId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-[rgba(var(--paper-rgb),0.075)] px-3 text-sm font-black text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]"
      >
        Menu
        <span aria-hidden="true">☰</span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-[var(--surface-overlay)]" aria-hidden="true" />
          <div
            ref={drawerRef}
            id={drawerId}
            role="dialog"
            aria-label="Lumeo navigation"
            className="aura-drawer-enter fixed inset-x-3 top-20 z-50 rounded-[var(--radius-2xl)] bg-[var(--surface-floating)] p-4 shadow-[var(--shadow-xl)] ring-1 ring-[var(--border-hairline)]"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-[var(--text-primary)]">Navigate Lumeo</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className="min-h-11 rounded-[var(--radius-md)] px-3 text-sm font-black text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]"
              >
                Close
              </button>
            </div>
            <nav aria-label="Mobile navigation" className="mt-3 grid gap-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="min-h-12 rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.055)] px-4 py-3 text-sm font-black text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
