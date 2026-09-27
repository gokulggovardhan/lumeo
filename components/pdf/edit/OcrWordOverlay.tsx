"use client";

import type { OcrPageResult } from "@/lib/pdf/edit/localOcr";

export function OcrWordOverlay({ result }: { result: OcrPageResult }) {
  return (
    <div
      data-edit-ocr-overlay
      data-edit-ocr-word-count={result.words.length}
      className="pointer-events-none absolute inset-0 z-[16]"
      aria-hidden="true"
    >
      {result.words.map((word, index) => (
        <span
          key={`${index}:${word.text}:${word.boundsPct.xPct}:${word.boundsPct.yPct}`}
          data-edit-ocr-word
          className="absolute rounded-[2px] border border-[var(--lumeo-gold)]/32 bg-[var(--lumeo-gold)]/[0.055]"
          style={{
            left: `${word.boundsPct.xPct}%`,
            top: `${word.boundsPct.yPct}%`,
            width: `${word.boundsPct.widthPct}%`,
            height: `${word.boundsPct.heightPct}%`,
            opacity: Math.max(0.28, Math.min(0.8, word.confidence / 125)),
          }}
        />
      ))}
    </div>
  );
}
