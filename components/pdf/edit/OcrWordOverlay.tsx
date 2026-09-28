"use client";

import type { OcrPageResult } from "@/lib/pdf/edit/localOcr";
import { OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD } from "@/lib/pdf/edit/ocrReview";

export function OcrWordOverlay({
  result,
  reviewMode = false,
  selectedWordIndex = null,
  corrections,
  onSelectWord,
}: {
  result: OcrPageResult;
  reviewMode?: boolean;
  selectedWordIndex?: number | null;
  corrections?: ReadonlyMap<number, string>;
  onSelectWord?: (index: number) => void;
}) {
  return (
    <div
      data-edit-ocr-overlay
      data-edit-ocr-word-count={result.words.length}
      data-edit-ocr-review-mode={reviewMode ? "true" : "false"}
      className="pointer-events-none absolute inset-0 z-[16]"
      aria-hidden={reviewMode ? undefined : true}
      role={reviewMode ? "group" : undefined}
      aria-label={reviewMode ? "OCR word review overlay" : undefined}
    >
      {result.words.map((word, index) => {
        const correctedText = corrections?.get(index);
        const displayText = correctedText ?? word.text;
        const corrected =
          correctedText !== undefined && correctedText !== word.text;
        const lowConfidence =
          word.confidence < OCR_REVIEW_LOW_CONFIDENCE_THRESHOLD;
        const selected = selectedWordIndex === index;
        const baseStyle = {
          left: `${word.boundsPct.xPct}%`,
          top: `${word.boundsPct.yPct}%`,
          width: `${word.boundsPct.widthPct}%`,
          height: `${word.boundsPct.heightPct}%`,
          opacity: Math.max(0.28, Math.min(0.8, word.confidence / 125)),
        };

        if (!reviewMode) {
          return (
            <span
              key={`${index}:${word.text}:${word.boundsPct.xPct}:${word.boundsPct.yPct}`}
              data-edit-ocr-word
              data-edit-ocr-confidence={word.confidence}
              className="absolute rounded-[2px] border border-[var(--lumeo-gold)]/32 bg-[var(--lumeo-gold)]/[0.055]"
              style={baseStyle}
            />
          );
        }

        return (
          <button
            key={`${index}:${word.text}:${word.boundsPct.xPct}:${word.boundsPct.yPct}`}
            type="button"
            data-edit-ocr-word
            data-edit-ocr-review-word
            data-edit-ocr-word-index={index}
            data-edit-ocr-confidence={word.confidence}
            data-edit-ocr-low-confidence={lowConfidence ? "true" : "false"}
            data-edit-ocr-corrected={corrected ? "true" : "false"}
            aria-pressed={selected}
            aria-label={`Review OCR word: ${displayText}, ${Math.round(word.confidence)}% confidence${corrected ? ", corrected" : ""}`}
            title={`${word.text} · ${Math.round(word.confidence)}% confidence`}
            onClick={(event) => {
              event.stopPropagation();
              onSelectWord?.(index);
            }}
            className={`pointer-events-auto absolute rounded-[2px] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] ${
              selected
                ? "border-2 border-[var(--lumeo-gold)] bg-[var(--lumeo-gold)]/24"
                : corrected
                  ? "border-2 border-[var(--lumeo-gold)]/70 bg-[var(--lumeo-gold)]/14"
                  : lowConfidence
                    ? "border-2 border-[var(--text-danger)]/55 bg-[var(--surface-danger)]/12"
                    : "border border-[var(--lumeo-gold)]/40 bg-[var(--lumeo-gold)]/[0.07]"
            }`}
            style={baseStyle}
          />
        );
      })}
    </div>
  );
}
