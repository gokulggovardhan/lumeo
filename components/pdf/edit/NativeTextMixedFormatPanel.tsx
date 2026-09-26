"use client";

import type {
  NativeTextMixedValue,
  NativeTextSelectionStyleSummary,
} from "@/lib/pdf/edit/mixedStyleSelection";

function mixedLabel<T>(
  value: NativeTextMixedValue<T>,
  format: (item: T) => string,
): string {
  return value.state === "mixed" ? "Mixed" : format(value.value);
}

function fillLabel(summary: NativeTextSelectionStyleSummary): string {
  if (summary.fillColor.state === "mixed") return "Mixed";
  const color = summary.fillColor.value;
  if (!color) return "Unknown";
  if (color.colorSpace === "DeviceCMYK") {
    return `CMYK ${color.components.map((value) => Number(value.toFixed(4))).join(" ")}`;
  }
  return color.cssHex ?? color.colorSpace;
}

/**
 * Read-only Phase 2.4A representation for a multi-span selection.
 *
 * It intentionally does not expose writable controls yet: a uniform style
 * change must be proved safe for every selected span and committed as one
 * semantic transaction. This component's job is to stop the UI from lying
 * about mixed formatting while that writer path is built.
 */
export function NativeTextMixedFormatPanel({
  summary,
}: {
  summary: NativeTextSelectionStyleSummary;
}) {
  const font = mixedLabel(summary.fontFamily, String);
  const weight = mixedLabel(summary.weight, (value) =>
    value >= 600 ? "Bold" : "Regular",
  );
  const italic = mixedLabel(summary.italic, (value) =>
    value ? "Italic" : "Not italic",
  );

  const fieldClass =
    "mt-1 min-h-9 rounded-md border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-0)]/35 px-2 py-2 text-[10px] font-semibold text-[var(--text-primary)]/75";

  return (
    <div
      data-native-mixed-formatting
      className="mt-2 rounded-lg border border-[var(--text-primary)]/12 bg-[var(--atelier-surface-0)]/40 p-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]/40">
            Original PDF font
          </div>
          <div
            data-native-mixed-font
            className="mt-0.5 truncate font-semibold"
          >
            {font}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <span
            data-native-mixed-weight
            className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--text-primary)]/65"
          >
            {weight}
          </span>
          <span
            data-native-mixed-italic
            className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--text-primary)]/65"
          >
            {italic}
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Size pt
          </div>
          <output
            aria-label="Native font size selection"
            data-native-mixed-font-size
            className={fieldClass}
          >
            {mixedLabel(summary.fontSizePt, (value) => String(Number(value.toFixed(3))))}
          </output>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Width %
          </div>
          <output
            aria-label="Native horizontal scale selection"
            data-native-mixed-horizontal-scale
            className={fieldClass}
          >
            {mixedLabel(summary.horizontalScalingPct, (value) =>
              String(Number(value.toFixed(3))),
            )}
          </output>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Letter pt
          </div>
          <output
            aria-label="Native character spacing selection"
            data-native-mixed-character-spacing
            className={fieldClass}
          >
            {mixedLabel(summary.charSpacingPt, (value) =>
              String(Number(value.toFixed(3))),
            )}
          </output>
        </div>
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Word pt
          </div>
          <output
            aria-label="Native word spacing selection"
            data-native-mixed-word-spacing
            className={fieldClass}
          >
            {mixedLabel(summary.wordSpacingPt, (value) =>
              String(Number(value.toFixed(3))),
            )}
          </output>
        </div>
      </div>

      <div className="mt-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
          Fill colour
        </div>
        <output
          aria-label="Native fill colour selection"
          data-native-mixed-fill
          className={fieldClass}
        >
          {fillLabel(summary)}
        </output>
      </div>

      <p className="mt-2 text-[9px] leading-4 text-[var(--text-primary)]/50">
        {summary.hasMixedValues
          ? "This selection contains multiple native styles. Mixed values are shown explicitly instead of borrowing the first span’s formatting."
          : "All selected spans currently share the same displayed native formatting."}
      </p>
    </div>
  );
}
