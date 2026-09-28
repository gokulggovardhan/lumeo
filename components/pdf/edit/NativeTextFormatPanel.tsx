"use client";

import type { PdfTextSpan } from "@/lib/pdf/edit/documentModel";
import type { NativeFillColorCapability } from "@/lib/pdf/edit/nativePaint";
import type { FontPreviewFidelity } from "@/lib/pdf/edit/fontPreviewFidelity";

export type NativeTextStyleDraft = {
  spanId: string;
  fontSizePt: number;
  charSpacing: number;
  wordSpacing: number;
  horizontalScalingPct: number;
  fillColorHex: string | null;
};

type NativeTextFormatPanelProps = {
  span: PdfTextSpan;
  draft: NativeTextStyleDraft;
  fillCapability: NativeFillColorCapability | null;
  previewFidelity: FontPreviewFidelity;
  panelPositionClass: string;
  horizontalClass: string;
  onPatchDraft: (patch: Partial<Omit<NativeTextStyleDraft, "spanId">>) => void;
  onResetDraft: () => void;
  onClearApplyError: () => void;
  nativeLocalFontLabel?: string | null;
  nativeLocalFontBusy?: boolean;
  nativeLocalFontApplying?: boolean;
  nativeLocalFontIssue?: string | null;
  nativeLocalFontReady?: boolean;
  onNativeLocalFontFile?: (file: File) => void;
  onClearNativeLocalFont?: () => void;
  onApplyNativeLocalFont?: () => void;
};

export function NativeTextFormatPanel({
  span,
  draft,
  fillCapability,
  previewFidelity,
  panelPositionClass,
  horizontalClass,
  onPatchDraft,
  onResetDraft,
  onClearApplyError,
  nativeLocalFontLabel = null,
  nativeLocalFontBusy = false,
  nativeLocalFontApplying = false,
  nativeLocalFontIssue = null,
  nativeLocalFontReady = false,
  onNativeLocalFontFile,
  onClearNativeLocalFont,
  onApplyNativeLocalFont,
}: NativeTextFormatPanelProps) {
  return (
    <div
      id="native-text-format-panel"
      data-native-text-formatting
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={`absolute z-40 w-[min(19rem,86vw)] rounded-xl border border-[var(--text-primary)]/14 bg-[var(--atelier-surface-1)]/98 p-3 text-[11px] text-[var(--text-primary)] shadow-2xl ${panelPositionClass} ${horizontalClass}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]/40">
            Original PDF font
          </div>
          <div className="mt-0.5 truncate font-semibold">
            {span.style.fontFamily || span.style.baseFont || "PDF font"}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <span className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--text-primary)]/65">
            {span.style.weight >= 600 ? "Bold" : "Regular"}
          </span>
          {span.style.italic ? (
            <span className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold italic text-[var(--text-primary)]/65">
              Italic
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--text-primary)]/10 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">
              Local replacement face
            </div>
            <div
              data-native-local-font-label
              className="mt-0.5 truncate text-[10px] font-semibold text-[var(--text-primary)]/72"
            >
              {nativeLocalFontBusy
                ? "Inspecting local font…"
                : nativeLocalFontLabel ?? "Use current PDF font"}
            </div>
          </div>
          {nativeLocalFontLabel ? (
            <button
              type="button"
              onClick={onClearNativeLocalFont}
              disabled={nativeLocalFontBusy || nativeLocalFontApplying}
              className="shrink-0 rounded-full border border-[var(--text-primary)]/14 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)]/65 disabled:opacity-40"
            >
              Reset
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <label className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-[var(--text-primary)]/14 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)]/70 transition hover:border-[var(--lumeo-gold)]/45 focus-within:ring-2 focus-within:ring-[var(--lumeo-gold)]">
            {nativeLocalFontBusy ? "Loading…" : "Choose .ttf/.otf"}
            <input
              data-native-local-font-input
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              className="sr-only"
              disabled={nativeLocalFontBusy || nativeLocalFontApplying}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) onNativeLocalFontFile?.(file);
              }}
            />
          </label>
          {nativeLocalFontLabel ? (
            <button
              type="button"
              data-native-local-font-apply
              onClick={onApplyNativeLocalFont}
              disabled={
                nativeLocalFontBusy ||
                nativeLocalFontApplying ||
                !nativeLocalFontReady
              }
              className="inline-flex min-h-9 items-center rounded-full border border-[var(--lumeo-gold)]/50 bg-[var(--lumeo-gold)]/10 px-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)] transition hover:bg-[var(--lumeo-gold)]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {nativeLocalFontApplying ? "Applying…" : "Apply local font"}
            </button>
          ) : null}
        </div>

        <p className="mt-2 text-[9px] leading-4 text-[var(--text-primary)]/50">
          Native font replacement embeds the exact local face into this PDF run only. It is enabled only when glyph mapping, shaping, resource updates, endpoint advance and reopened search text can all be proven locally.
        </p>
        {nativeLocalFontIssue ? (
          <p
            role="status"
            data-native-local-font-status
            className="mt-1.5 text-[9px] font-semibold leading-4 text-[var(--text-primary)]/70"
          >
            {nativeLocalFontIssue}
          </p>
        ) : nativeLocalFontLabel && nativeLocalFontReady ? (
          <p
            role="status"
            data-native-local-font-status
            className="mt-1.5 text-[9px] font-semibold leading-4 text-[var(--text-primary)]/70"
          >
            Ready for this exact text and native PDF target.
          </p>
        ) : null}
      </div>

      <div
        data-font-preview-fidelity={previewFidelity.kind}
        title={previewFidelity.detail}
        className="mt-2 rounded-lg border border-[var(--text-primary)]/10 bg-[var(--text-primary)]/[0.025] px-2.5 py-2"
      >
        <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/58">
          {previewFidelity.label}
        </div>
        <p
          data-font-preview-fidelity-detail
          className="mt-1 text-[9px] leading-4 text-[var(--text-primary)]/50"
        >
          {previewFidelity.detail}
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-[var(--text-primary)]/10 p-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Fill colour</span>
          {fillCapability?.sourceColor ? (
            <span className="rounded-full border border-[var(--text-primary)]/12 px-2 py-0.5 text-[9px] font-semibold text-[var(--text-primary)]/60">
              {fillCapability.sourceColor.colorSpace === "DeviceGray"
                ? "Gray"
                : fillCapability.sourceColor.colorSpace === "DeviceRGB"
                  ? "RGB"
                  : "CMYK"}
            </span>
          ) : null}
        </div>
        {fillCapability?.editable && draft.fillColorHex ? (
          <label className="mt-2 flex items-center gap-2">
            <input
              aria-label="Native fill colour"
              type="color"
              value={draft.fillColorHex}
              onChange={(event) => {
                onPatchDraft({ fillColorHex: event.currentTarget.value.toLowerCase() });
                onClearApplyError();
              }}
              className="h-9 w-12 cursor-pointer rounded-md border border-[var(--text-primary)]/14 bg-transparent p-1"
            />
            <code data-native-fill-value className="text-[10px] font-semibold text-[var(--text-primary)]/70">
              {draft.fillColorHex}
            </code>
          </label>
        ) : (
          <div data-native-fill-limited className="mt-2 grid gap-1 text-[9px] leading-4 text-[var(--text-primary)]/58">
            <div className="font-semibold text-[var(--text-primary)]/72">
              {fillCapability?.sourceColor?.colorSpace === "DeviceCMYK"
                ? `CMYK ${fillCapability.sourceColor.components.map((value) => Number(value.toFixed(4))).join(" ")}`
                : fillCapability?.sourceColor
                  ? `${fillCapability.sourceColor.colorSpace} ${fillCapability.sourceColor.cssHex ?? "native paint"}`
                  : "Unknown native fill"}
            </div>
            <div>{fillCapability?.reason ?? "This selection does not expose a proven editable native fill colour."}</div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Size pt</span>
          <input
            aria-label="Native font size"
            type="number"
            min={1}
            max={500}
            step={0.5}
            value={draft.fontSizePt}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) onPatchDraft({ fontSizePt: value });
            }}
            className="h-9 rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 font-semibold outline-none focus:border-[var(--lumeo-gold)]/55"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Width %</span>
          <input
            aria-label="Native horizontal scale"
            type="number"
            min={10}
            max={500}
            step={1}
            value={draft.horizontalScalingPct}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) onPatchDraft({ horizontalScalingPct: value });
            }}
            className="h-9 rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 font-semibold outline-none focus:border-[var(--lumeo-gold)]/55"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Letter pt</span>
          <input
            aria-label="Native character spacing"
            type="number"
            step={0.1}
            value={draft.charSpacing}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) onPatchDraft({ charSpacing: value });
            }}
            className="h-9 rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 font-semibold outline-none focus:border-[var(--lumeo-gold)]/55"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-primary)]/45">Word pt</span>
          <input
            aria-label="Native word spacing"
            type="number"
            step={0.1}
            value={draft.wordSpacing}
            onChange={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isFinite(value)) onPatchDraft({ wordSpacing: value });
            }}
            className="h-9 rounded-md border border-[var(--text-primary)]/14 bg-transparent px-2 font-semibold outline-none focus:border-[var(--lumeo-gold)]/55"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[9px] leading-4 text-[var(--text-primary)]/48">
          Size, spacing and fill use the existing native writer. Font face changes use the separate validated local-font resource path above; weight, italic and alignment remain inherited.
        </p>
        <button
          type="button"
          onClick={onResetDraft}
          className="shrink-0 rounded-full border border-[var(--text-primary)]/14 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)]/65 hover:text-[var(--text-primary)]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
