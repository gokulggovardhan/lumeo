"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { PublicToolCategory } from "@/lib/public-catalog/types";

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
        className={`lumeo-press lumeo-focus-ring inline-flex items-center justify-center gap-2 rounded-full border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.02] text-sm font-semibold text-[#F0EAD6]/72 transition duration-200 hover:border-[#CBA052]/28 hover:bg-[#F0EAD6]/[0.04] hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 ${
          compact ? "h-10 px-3.5 sm:h-11 sm:px-4" : "px-3 py-2.5 sm:px-4"
        }`}
      >
        <span>{compact ? "PDF Tools" : "PDF Tools"}</span>
        <Chevron open={open} />
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-40 bg-[#0C1220]/56 md:hidden" aria-hidden="true" />
          <div
            id={menuId}
            role="dialog"
            aria-label="PDF Tools"
            className="lumeo-fade-up fixed inset-x-3 top-20 z-50 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-[22px] border border-[#E8DFC8]/10 bg-[#111A2B] p-3 shadow-[0_28px_90px_rgba(0,0,0,0.52)] md:absolute md:inset-auto md:right-0 md:top-[calc(100%+0.65rem)] md:w-[min(46rem,calc(100vw-2rem))] md:max-h-[74vh]"
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#E8DFC8]/8 px-2 pb-3">
              <div>
                <p className="text-sm font-bold text-[#F0EAD6]">PDF Tools</p>
                <p className="mt-1 text-xs text-[#F0EAD6]/48">Choose a workspace by category.</p>
              </div>
              <Link
                href="/pdf-tools"
                onClick={() => setOpen(false)}
                className="rounded-full border border-[#1E6B4A]/38 bg-[#1E6B4A]/12 px-3 py-2 text-xs font-bold text-[#DDF5E9] transition hover:bg-[#1E6B4A]/20"
              >
                View all PDF tools
              </Link>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {categories.map((category) => (
                <section key={category.slug} className="rounded-2xl border border-[#E8DFC8]/8 bg-[#0C1220]/42 p-3">
                  <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/78">{category.name}</h2>
                  <div className="mt-2 grid gap-1.5">
                    {category.tools.map((tool) => (
                      <Link
                        key={tool.route}
                        href={tool.route}
                        onClick={() => setOpen(false)}
                        className="group rounded-xl border border-transparent px-3 py-2.5 text-left transition duration-200 hover:border-[#E8DFC8]/10 hover:bg-[#F0EAD6]/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/35"
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[#F0EAD6]">{tool.toolName}</span>
                          <span aria-hidden="true" className="text-[#CBA052] transition group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#F0EAD6]/50">{tool.shortDescription}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
