"use client";

import { useMemo, useState } from "react";
import type {
  NativeTextMixedValue,
  NativeTextSelectionStyleSummary,
} from "@/lib/pdf/edit/mixedStyleSelection";
import type { NativeTextStyleBatchPatch } from "@/lib/pdf/edit/multiStylePlan";

function mixedLabel<T>(
  value: NativeTextMixedValue<T>,
  format: (item: T) => string,
): string {
  return value.state === "mixed" ? "Mixed" : format(value.value);
}

function numberText(value: NativeTextMixedValue<number>): string {
  return value.state === "mixed"
    ? ""
    : String(Number(value.value.toFixed(3)));
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

type Draft = {
  fontSizePt: string;
  horizontalScalingPct: string;
  charSpacingPt: string;
  wordSpacingPt: string;
  fillColorHex: string;
};

function initialDraft(summary: NativeTextSelectionStyleSummary): Draft {
  return {
    fontSizePt: numberText(summary.fontSizePt),
    horizontalScalingPct: numberText(summary.horizontalScalingPct),
    charSpacingPt: numberText(summary.charSpacingPt),
    wordSpacingPt: numberText(summary.wordSpacingPt),
    fillColorHex:
      summary.fillColor.state === "single" &&
      summary.fillColor.value?.cssHex
        ? summary.fillColor.value.cssHex
        : "",
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.fontSizePt === b.fontSizePt &&
    a.horizontalScalingPct === b.horizontalScalingPct &&
    a.charSpacingPt === b.charSpacingPt &&
    a.wordSpacingPt === b.wordSpacingPt &&
    a.fillColorHex.toLowerCase() === b.fillColorHex.toLowerCase()
  );
}

/**
 * Phase 2.4B formatting surface for a multi-span native-text selection.
 *
 * Mixed values stay visually blank with an explicit "Mixed — preserve"
 * placeholder; leaving a mixed field blank preserves every span's own value.
 * Entering one value asks the parent writer to apply that value uniformly,
 * but the writer still has to prove every changed PDF span safe before any
 * bytes are committed.
 *
 * Font face/weight/italic remain read-only here. This slice changes only the
 * already-proven native text-state fields plus exact Gray/RGB fill colour;
 * each span keeps its own PDF font resource.
 */
export function NativeTextMixedFormatPanel({
  summary,
  applying,
  onApply,
}: {
  summary: NativeTextSelectionStyleSummary;
  applying: boolean;
  onApply: (patch: NativeTextStyleBatchPatch) => Promise<void> | void;
}) {
  const baseline = useMemo(() => initialDraft(summary), [summary]);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(summary));

  const font = mixedLabel(summary.fontFamily, String);
  const weight = mixedLabel(summary.weight, (value) =>
    value >= 600 ? "Bold" : "Regular",
  );
  const italic = mixedLabel(summary.italic, (value) =>
    value ? "Italic" : "Not italic",
  );

  const numericValues = [
    draft.fontSizePt,
    draft.horizontalScalingPct,
    draft.charSpacingPt,
    draft.wordSpacingPt,
  ].filter((value) => value.trim().length > 0);
  const numericValid = numericValues.every((value) =>
    Number.isFinite(Number(value)),
  );
  const changed = !sameDraft(draft, baseline);
  const canApply = changed && numericValid && !applying;

  const inputClass =
    "mt-1 min-h-9 w-full rounded-md border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-0)]/35 px-2 py-2 text-[10px] font-semibold text-[var(--text-primary)]/80 outline-none transition placeholder:text-[var(--text-primary)]/35 focus:border-[var(--lumeo-gold)]/45 focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)]/35";

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function apply() {
    if (!canApply) return;
    const patchRequest: NativeTextStyleBatchPatch = {
      fontSizePt: parseOptionalNumber(draft.fontSizePt),
      horizontalScalingPct: parseOptionalNumber(
        draft.horizontalScalingPct,
      ),
      charSpacing: parseOptionalNumber(draft.charSpacingPt),
      wordSpacing: parseOptionalNumber(draft.wordSpacingPt),
      fillColorHex: draft.fillColorHex.trim() || undefined,
    };
    await onApply(patchRequest);
  }

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

      <p className="mt-2 text-[9px] leading-4 text-[var(--text-primary)]/50">
        {summary.hasMixedValues
          ? "Mixed values are explicit. Leave a mixed field blank to preserve each span, or enter one value to apply it uniformly."
          : "All selected spans currently share the displayed native formatting. Change only the fields you want to apply uniformly."}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Size pt
          </span>
          <input
            aria-label="Native font size selection"
            data-native-mixed-font-size
            inputMode="decimal"
            value={draft.fontSizePt}
            placeholder={summary.fontSizePt.state === "mixed" ? "Mixed — preserve" : undefined}
            onChange={(event) => patch("fontSizePt", event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Width %
          </span>
          <input
            aria-label="Native horizontal scale selection"
            data-native-mixed-horizontal-scale
            inputMode="decimal"
            value={draft.horizontalScalingPct}
            placeholder={summary.horizontalScalingPct.state === "mixed" ? "Mixed — preserve" : undefined}
            onChange={(event) =>
              patch("horizontalScalingPct", event.target.value)
            }
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Letter pt
          </span>
          <input
            aria-label="Native character spacing selection"
            data-native-mixed-character-spacing
            inputMode="decimal"
            value={draft.charSpacingPt}
            placeholder={summary.charSpacingPt.state === "mixed" ? "Mixed — preserve" : undefined}
            onChange={(event) => patch("charSpacingPt", event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
            Word pt
          </span>
          <input
            aria-label="Native word spacing selection"
            data-native-mixed-word-spacing
            inputMode="decimal"
            value={draft.wordSpacingPt}
            placeholder={summary.wordSpacingPt.state === "mixed" ? "Mixed — preserve" : undefined}
            onChange={(event) => patch("wordSpacingPt", event.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
          Fill colour
        </span>
        <input
          aria-label="Native fill colour selection"
          data-native-mixed-fill
          value={draft.fillColorHex}
          placeholder={
            summary.fillColor.state === "mixed"
              ? "Mixed — preserve"
              : fillLabel(summary)
          }
          onChange={(event) => patch("fillColorHex", event.target.value)}
          className={inputClass}
        />
      </label>

      {!numericValid ? (
        <p role="alert" className="mt-2 text-[9px] font-semibold text-[var(--text-danger)]">
          Formatting numbers must be valid finite values.
        </p>
      ) : null}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-native-mixed-apply
          disabled={!canApply}
          onClick={() => void apply()}
          className="min-h-10 flex-1 rounded-lg border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/10 px-2.5 text-[10px] font-bold text-[var(--text-primary)] transition hover:bg-[var(--lumeo-gold)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {applying ? "Applying formatting…" : "Apply formatting"}
        </button>
        <button
          type="button"
          disabled={!changed || applying}
          onClick={() => setDraft(baseline)}
          className="min-h-10 rounded-lg border border-[var(--text-primary)]/14 px-2.5 text-[10px] font-bold text-[var(--text-primary)]/65 transition hover:border-[var(--text-primary)]/24 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lumeo-gold)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <p className="mt-2 text-[9px] leading-4 text-[var(--text-primary)]/45">
        Font face, weight and italic stay unchanged. Lumeo preserves each span&apos;s own PDF font resource.
      </p>
    </div>
  );
}
