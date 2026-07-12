"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { pdfTools } from "./PdfToolRegistry";

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    </svg>
  );
}

export function PdfToolSwitcher() {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const activeTool = pdfTools.find((tool) => pathname === tool.route);
  const label = activeTool?.shortTitle ?? "Tools";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="lumeo-press lumeo-focus-ring inline-flex h-10 max-w-[10rem] items-center justify-center gap-2 rounded-full border border-[#E8DFC8]/10 bg-[#F0EAD6]/[0.02] px-3.5 text-xs font-semibold text-[#F0EAD6]/68 transition hover:border-[#CBA052]/28 hover:bg-[#F0EAD6]/[0.04] hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 sm:h-11 sm:max-w-none sm:px-4"
      >
        <span className="truncate">{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div role="menu" className="lumeo-fade-up absolute right-0 top-[calc(100%+0.55rem)] z-50 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-[#E8DFC8]/10 bg-[#111A2B] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
          {pdfTools.map((tool) => {
            const active = pathname === tool.route;
            const live = tool.status === "live";
            return (
              <Link
                key={tool.route}
                href={tool.route}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`lumeo-press flex items-center justify-between gap-4 rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-[#1E6B4A]/28 bg-[#1E6B4A]/12"
                    : "border-transparent hover:border-[#E8DFC8]/8 hover:bg-[#F0EAD6]/[0.035]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#F0EAD6]">{tool.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-[#F0EAD6]/50">{tool.description}</span>
                </span>
                {!live ? (
                  <span className="rounded-full border border-[#E8DFC8]/9 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-[#F0EAD6]/40">
                    Soon
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
