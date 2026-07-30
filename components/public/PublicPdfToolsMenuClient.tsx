"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { L2MenuSurface } from "@/components/ui/Aura";
import type { Tile } from "@/lib/tools/tiles";

const MENU_ID = "lumeo-pdf-tools-menu";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform duration-[var(--v2-motion-normal)] ${open ? "rotate-180" : ""}`} fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export function PublicPdfToolsMenuClient({
  tiles,
  hasMoreComingSoon = false,
  compact = false,
}: {
  tiles: Tile[];
  hasMoreComingSoon?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) {
      document.body.style.overflow = "hidden";
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;

      setOpen(false);
      buttonRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative z-50">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={() => setOpen((value) => !value)}
        className={`lumeo-press lumeo-focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[rgba(var(--paper-rgb),0.075)] text-sm font-extrabold text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] transition duration-[var(--v2-motion-normal)] hover:bg-[rgba(var(--paper-rgb),0.12)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--v2-focus-ring-default)] ${
          compact ? "h-11 px-3.5 sm:px-4" : "px-3 py-2.5 sm:px-4"
        }`}
      >
        <span>PDF Tools</span>
        <Chevron open={open} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-[var(--v2-surface-overlay)] backdrop-blur-[var(--v2-glass-thin-blur)] md:hidden" aria-hidden="true" />
          <L2MenuSurface
            id={MENU_ID}
            role="menu"
            aria-label="PDF Tools"
            className="aura-menu-reveal pointer-events-auto fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto md:absolute md:inset-auto md:right-0 md:top-[calc(100%+0.65rem)] md:w-[min(23rem,calc(100vw-2rem))] md:max-h-[70vh] xl:right-[-20rem]"
          >
            <div className="flex items-start justify-between gap-4 px-1 pb-2">
              <div>
                <p className="text-sm font-black text-[var(--text-primary)]">PDF Tools</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Jump straight to any tool.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className="min-h-10 rounded-[var(--radius-md)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[rgba(var(--paper-rgb),0.07)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--v2-focus-ring-default)] md:hidden"
              >
                Close
              </button>
            </div>

            <div className="mt-1 grid gap-1">
              {tiles.map((tile) => (
                <Link
                  key={tile.route}
                  href={tile.route}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="lumeo-tool-menuitem group flex items-center gap-3 rounded-[var(--radius-lg)] px-2.5 py-2.5 text-left transition duration-[var(--v2-motion-normal)] hover:bg-[rgba(var(--paper-rgb),0.075)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--v2-focus-ring-subtle)]"
                >
                  <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[rgba(var(--champagne-rgb),0.1)] text-[var(--text-premium)]">
                    <ToolGlyph name={tile.glyph} className="h-[19px] w-[19px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-[0.95rem] font-medium leading-tight text-[var(--text-primary)]">{tile.label}</span>
                    <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[var(--text-muted)]">{tile.description}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[var(--text-premium)] transition group-hover:translate-x-0.5 motion-reduce:transform-none">
                    →
                  </span>
                </Link>
              ))}
            </div>

            {hasMoreComingSoon ? (
              <p className="mt-2 px-2.5 text-[11px] text-[var(--text-subtle)]">More tools are in development.</p>
            ) : null}

            <Link
              href="/pdf-tools"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-3 flex min-h-11 items-center justify-between rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(var(--paper-rgb),0.055)] px-3 text-sm font-black text-[var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,253,248,0.07)] transition hover:bg-[rgba(var(--paper-rgb),0.085)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--v2-focus-ring-default)]"
            >
              <span>View all PDF tools</span>
              <span aria-hidden="true" className="text-[var(--text-premium)]">→</span>
            </Link>
          </L2MenuSurface>
        </>
      ) : null}
    </div>
  );
}
