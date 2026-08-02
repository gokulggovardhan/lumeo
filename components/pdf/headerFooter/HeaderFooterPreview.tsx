"use client";

// components/pdf/headerFooter/HeaderFooterPreview.tsx
//
// Renders the current page's pdfjs-rendered background plus static (non-
// draggable) header/footer text overlays -- Header & Footer has no manual
// positioning in its approved feature list (left/center/right alignment
// only), so unlike WatermarkPreview/PageNumberPreview there's no pointer
// drag/keyboard-move logic to reuse here. Positions come straight from
// lib/pdf/core/placement.ts's cornerAnchorPct via alignmentToCorner, the
// same function the real export uses, so the preview can never disagree
// with what gets drawn.

import { alignmentToCorner } from "@/lib/pdf/headerFooter/config";
import { cornerAnchorPct } from "@/lib/pdf/core/placement.ts";
import type { TextZoneAlignment } from "@/lib/pdf/headerFooter/config";

function ZoneOverlay({
  text,
  zone,
  alignment,
  widthPct,
  heightPct,
  marginPct,
  pageWidthPt,
  pageHeightPt,
  style,
}: {
  text: string;
  zone: "header" | "footer";
  alignment: TextZoneAlignment;
  widthPct: number;
  heightPct: number;
  marginPct: number;
  pageWidthPt: number;
  pageHeightPt: number;
  style: React.CSSProperties;
}) {
  if (!text) return null;
  const corner = alignmentToCorner(zone, alignment);
  const anchor = cornerAnchorPct(corner, marginPct, widthPct, heightPct, 0, pageWidthPt, pageHeightPt);

  return (
    <div
      className="pointer-events-none absolute select-none whitespace-nowrap"
      style={{ left: `${anchor.xPct}%`, top: `${anchor.yPct}%`, ...style }}
    >
      {text}
    </div>
  );
}

export function HeaderFooterPreview({
  pageImageUrl,
  headerText,
  footerText,
  headerAlignment,
  footerAlignment,
  contentWidthPct,
  contentHeightPct,
  marginPct,
  pageWidthPt,
  pageHeightPt,
  textStyle,
}: {
  pageImageUrl: string;
  headerText: string;
  footerText: string;
  headerAlignment: TextZoneAlignment;
  footerAlignment: TextZoneAlignment;
  contentWidthPct: number;
  contentHeightPct: number;
  marginPct: number;
  pageWidthPt: number;
  pageHeightPt: number;
  textStyle: React.CSSProperties;
}) {
  return (
    <div
      className="relative mx-auto max-h-[70vh] w-full overflow-hidden rounded-lg border border-[var(--text-primary)]/12 bg-white"
      style={{ aspectRatio: `${pageWidthPt} / ${pageHeightPt}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pageImageUrl} alt="Page preview" className="pointer-events-none block h-full w-full select-none" />

      <ZoneOverlay text={headerText} zone="header" alignment={headerAlignment} widthPct={contentWidthPct} heightPct={contentHeightPct} marginPct={marginPct} pageWidthPt={pageWidthPt} pageHeightPt={pageHeightPt} style={textStyle} />
      <ZoneOverlay text={footerText} zone="footer" alignment={footerAlignment} widthPct={contentWidthPct} heightPct={contentHeightPct} marginPct={marginPct} pageWidthPt={pageWidthPt} pageHeightPt={pageHeightPt} style={textStyle} />
    </div>
  );
}
