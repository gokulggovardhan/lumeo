"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const tools = [
  {
    title: "Merge PDF",
    description: "Combine PDFs into one clean document.",
    route: "/pdf/merge",
  },
  {
    title: "Split PDF",
    description: "Extract pages or separate one PDF.",
    route: "/pdf/split",
  },
  {
    title: "Compress PDF",
    description: "Reduce PDF size carefully.",
    route: "/pdf/compress",
  },
  {
    title: "JPG to PDF",
    description: "Turn images into a polished PDF.",
    route: "/pdf/jpg-to-pdf",
  },
  {
    title: "PDF to JPG",
    description: "Export PDF pages as images.",
    route: "/pdf/pdf-to-jpg",
  },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
    >
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export function PdfToolSwitcher() {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const activeTool = tools.find((tool) => pathname === tool.route);
  const label = activeTool?.title ?? "Tools";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
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
        className="inline-flex h-10 max-w-[10.5rem] items-center justify-center gap-2 rounded-full border border-[#E8DFC8]/16 bg-[#0A101C]/54 px-3 text-xs font-semibold text-[#F0EAD6]/72 shadow-[0_12px_34px_rgba(0,0,0,0.2)] transition hover:border-[#C9A84C]/32 hover:bg-[#F0EAD6]/[0.035] hover:text-[#F0EAD6] sm:h-11 sm:max-w-none sm:px-4"
      >
        <span className="truncate">{label}</span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[#C9A84C]/22 bg-[#080D17] p-2 shadow-[0_26px_80px_rgba(0,0,0,0.45)]"
        >
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#C9A84C]/50 to-transparent" />
          {tools.map((tool) => {
            const active = pathname === tool.route;

            return (
              <Link
                key={tool.route}
                href={tool.route}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-[#1E6B4A]/36 bg-[#1E6B4A]/14"
                    : "border-transparent hover:border-[#E8DFC8]/10 hover:bg-[#F0EAD6]/[0.035]"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    active ? "bg-[#1E6B4A] shadow-[0_0_0_3px_rgba(30,107,74,0.18)]" : "bg-[#C9A84C]/36"
                  }`}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-bold text-[#F0EAD6]">
                    {tool.title}
                    {active ? (
                      <span className="rounded-full bg-[#C9A84C]/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-[#C9A84C]">
                        Current
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[#F0EAD6]/45">
                    {tool.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
