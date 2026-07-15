"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicToolCategory } from "@/lib/public-catalog/types";
import { L2MenuSurface } from "@/components/ui/Aura";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export function PublicPdfToolsMenuClient({
  categories,
  compact = false,
}: {
  categories: PublicToolCategory[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 767px)").matches) {
      document.body.style.overflow = "hidden";
    }

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
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
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={`lumeo-press lumeo-focus-ring inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[rgba(var(--paper-rgb),0.075)] text-sm font-extrabold text-[var(--text-secondary)] shadow-[inset_0_1px_0_rgba(255,253,248,0.08)] transition duration-200 hover:bg-[rgba(var(--paper-rgb),0.12)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)] ${
          compact ? "h-10 px-3.5 sm:h-11 sm:px-4" : "px-3 py-2.5 sm:px-4"
        }`}
      >
        <span>{compact ? "PDF Tools" : "PDF Tools"}</span>
        <Chevron open={open} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-[var(--surface-overlay)] md:hidden" aria-hidden="true" />
          <L2MenuSurface
            id={menuId}
            role="dialog"
            aria-label="PDF Tools"
            className="aura-menu-reveal fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto md:absolute md:inset-auto md:right-0 md:top-[calc(100%+0.65rem)] md:w-[min(47.5rem,calc(100vw-2rem))] md:max-h-[74vh]"
          >
            <div className="flex items-center justify-between gap-4 px-2 pb-3">
              <div>
                <p className="text-sm font-black text-[var(--lumeo-paper-50)]">PDF Tools</p>
                <p className="mt-1 text-xs text-[var(--lumeo-paper-400)]">Choose a workspace by category.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className="min-h-10 rounded-[var(--radius-md)] px-3 text-xs font-black text-[var(--text-secondary)] transition hover:bg-[rgba(var(--paper-rgb),0.07)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)] md:hidden"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {categories.map((category) => (
                <section key={category.slug} className="rounded-[var(--radius-xl)] bg-[rgba(var(--paper-rgb),0.05)] p-3 shadow-[inset_0_1px_0_rgba(255,253,248,0.06)]">
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--lumeo-gold-300)]">{category.name}</h2>
                  <div className="mt-2 grid gap-1.5">
                    {category.tools.map((tool) => (
                      <Link
                        key={tool.route}
                        href={tool.route}
                        onClick={() => setOpen(false)}
                        className="group rounded-[var(--radius-lg)] px-3 py-2.5 text-left transition duration-200 hover:bg-[rgba(var(--paper-rgb),0.075)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.18)]"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--lumeo-paper-50)]">{tool.toolName}</span>
                          <span aria-hidden="true" className="text-[var(--lumeo-gold-300)] transition group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[var(--lumeo-paper-400)]">{tool.shortDescription}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <Link
              href="/pdf-tools"
              onClick={() => setOpen(false)}
              className="mt-3 flex min-h-11 items-center justify-center rounded-[var(--radius-lg)] bg-[linear-gradient(180deg,var(--emerald-400),var(--emerald-600))] px-4 text-sm font-black text-[var(--text-on-accent)] shadow-[var(--shadow-success)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]"
            >
              View all PDF tools
            </Link>
          </L2MenuSurface>
        </>
      ) : null}
    </div>
  );
}
