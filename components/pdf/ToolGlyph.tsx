// components/pdf/ToolGlyph.tsx
//
// Custom line-icons, one per Lumeo tool. Each carries classed sub-paths that
// the discovery/nav CSS animates on hover (see the .lumeo-tool-card /
// .lumeo-tool-menuitem hover rules in globals.css). Bespoke to Lumeo, not a
// stock icon set -- part of the "unique in all aspects" direction.

import type { CSSProperties } from "react";
import type { ToolGlyphName } from "@/lib/tools/catalog";

type ShardStyle = CSSProperties & { "--fx"?: string; "--fy"?: string };

const shard = (fx: string, fy: string): ShardStyle => ({ "--fx": fx, "--fy": fy });

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ToolGlyph({ name, className }: { name: ToolGlyphName; className?: string }) {
  const cls = ["lumeo-glyph", `ic-${name}`, className].filter(Boolean).join(" ");

  switch (name) {
    case "compose":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect className="pg2" x="6" y="4" width="12" height="16" rx="1.6" opacity="0.4" />
          <rect className="pg1" x="6" y="4" width="12" height="16" rx="1.6" opacity="0.65" />
          <rect x="6" y="4" width="12" height="16" rx="1.6" />
          <path d="M9 9h6M9 12h6M9 15h4" />
        </svg>
      );
    case "distill":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect x="5" y="4" width="14" height="16" rx="1.6" opacity="0.45" />
          <path className="barT" d="M9 9l3-2.5 3 2.5" />
          <path className="barB" d="M9 15l3 2.5 3-2.5" />
          <path d="M8 12h8" opacity="0.8" />
        </svg>
      );
    case "capture":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect x="8" y="8" width="8" height="11" rx="1.4" />
          <path className="sh" style={shard("-6px", "-3px")} d="M4 5.5l2.4.6" />
          <path className="sh" style={shard("6px", "-3px")} d="M20 5.5l-2.4.6" />
          <path className="sh" style={shard("0", "-6px")} d="M12 3v2.6" />
          <path d="M10 12l1.5 1.5L14 11" />
        </svg>
      );
    case "render":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect className="fan1" x="6" y="5" width="11" height="14" rx="1.5" opacity="0.45" />
          <rect className="fan2" x="7" y="5" width="11" height="14" rx="1.5" opacity="0.65" />
          <rect x="8" y="6" width="9" height="13" rx="1.4" />
          <circle cx="12.5" cy="11" r="1.3" />
          <path d="M9.5 16l2.2-2.6 1.6 1.8 1.4-1.2 1.8 2" />
        </svg>
      );
    case "inscribe":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect x="4" y="4" width="12" height="16" rx="1.6" opacity="0.45" />
          <path className="stroke" d="M7 15c2-3.5 5-3.5 7-1" />
          <path className="nib" d="M15 5.5l3.5 3.5-6 6-3.6.6.6-3.6z" fill="rgba(148,170,151,.1)" />
        </svg>
      );
    case "seal":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <circle className="ring2" cx="12" cy="10" r="6" />
          <circle className="core" cx="12" cy="10" r="5" />
          <path className="core" d="M9.7 10l1.6 1.6 3-3.2" />
          <path d="M8.5 14.5L7 21l5-2 5 2-1.5-6.5" />
        </svg>
      );
    case "secure":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <path className="shackle" d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" />
          <rect x="6" y="10" width="12" height="9" rx="2" />
          <circle cx="12" cy="14" r="1.3" />
          <path d="M12 15v2" />
        </svg>
      );
    case "convert":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <g className="arrows">
            <path d="M4 9h11l-2.5-2.5M20 15H9l2.5 2.5" />
          </g>
        </svg>
      );
    case "recognize":
      return (
        <svg {...base} className={cls} aria-hidden="true">
          <rect x="4" y="3.6" width="16" height="16.8" rx="1.8" opacity="0.5" />
          <path d="M8 8h8M8 11h8M8 14h5" />
          <rect className="scan" x="5.5" y="6.6" width="13" height="3" rx="1" fill="rgba(148,170,151,.16)" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}
