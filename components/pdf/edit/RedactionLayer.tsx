"use client";

// components/pdf/edit/RedactionLayer.tsx
//
// Drag-to-draw redaction boxes over the rendered page, plus the review list
// of what those boxes will remove.
//
// Boxes are stored in PERCENT space, like every other overlay in this tool,
// so a box drawn at one zoom or raster scale stays put at another -- the
// property that made high-zoom re-rendering safe (#240) applies here for
// the same reason.
//
// Deliberately NOT a preview of the redacted result: showing black
// rectangles and calling it done is how people come to believe a mask is a
// redaction. The list below the page names the runs that will actually be
// removed, and the caller shows the coverage warnings for the ones that
// will not be.

import { useCallback, useRef, useState } from "react";
import type { RedactionBox } from "@/lib/pdf/edit/redaction";

export type RedactionLayerProps = {
  boxes: readonly RedactionBox[];
  /** Runs that intersect the current boxes -- what will actually be stripped. */
  targetedRuns: readonly { str: string }[];
  disabled: boolean;
  onAddBox: (box: RedactionBox) => void;
  onRemoveBox: (index: number) => void;
};

const MIN_BOX_PCT = 0.6;

export default function RedactionLayer({ boxes, targetedRuns, disabled, onAddBox, onRemoveBox }: RedactionLayerProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<RedactionBox | null>(null);
  const originRef = useRef<{ xPct: number; yPct: number } | null>(null);

  const toPercent = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      xPct: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      yPct: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      const point = toPercent(event);
      if (!point) return;
      // Pointer capture so a drag that leaves the page still finishes here
      // rather than being abandoned mid-box.
      event.currentTarget.setPointerCapture(event.pointerId);
      originRef.current = point;
      setDraft({ xPct: point.xPct, yPct: point.yPct, widthPct: 0, heightPct: 0 });
    },
    [disabled, toPercent],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const origin = originRef.current;
      if (!origin) return;
      const point = toPercent(event);
      if (!point) return;
      setDraft({
        xPct: Math.min(origin.xPct, point.xPct),
        yPct: Math.min(origin.yPct, point.yPct),
        widthPct: Math.abs(point.xPct - origin.xPct),
        heightPct: Math.abs(point.yPct - origin.yPct),
      });
    },
    [toPercent],
  );

  const handlePointerUp = useCallback(() => {
    const box = draft;
    originRef.current = null;
    setDraft(null);
    // A stray click is not a redaction. Without this floor, tapping the page
    // silently adds a zero-area box that redacts nothing and clutters the
    // review list.
    if (box && box.widthPct >= MIN_BOX_PCT && box.heightPct >= MIN_BOX_PCT) onAddBox(box);
  }, [draft, onAddBox]);

  return (
    <>
      <div
        ref={surfaceRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label="Draw a box over text to redact it"
        className={`absolute inset-0 z-30 ${disabled ? "" : "cursor-crosshair"}`}
      >
        {boxes.map((box, index) => (
          <div
            key={`${box.xPct}-${box.yPct}-${index}`}
            style={{ left: `${box.xPct}%`, top: `${box.yPct}%`, width: `${box.widthPct}%`, height: `${box.heightPct}%` }}
            className="absolute border border-[#ff4d4d] bg-black/85"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveBox(index);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Remove redaction box ${index + 1}`}
              className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full border border-[#ff4d4d] bg-[#1b1d22] text-[10px] font-bold text-[#ff8080]"
            >
              ×
            </button>
          </div>
        ))}
        {draft ? (
          <div
            style={{ left: `${draft.xPct}%`, top: `${draft.yPct}%`, width: `${draft.widthPct}%`, height: `${draft.heightPct}%` }}
            className="absolute border border-dashed border-[#ff4d4d] bg-black/40"
          />
        ) : null}
      </div>

      {/* Outside the overlay so it is readable regardless of page zoom. */}
      {boxes.length > 0 ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-40 max-w-[280px] rounded-[var(--radius-lg)] border border-[#ff4d4d]/40 bg-[#14161a]/95 p-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#ff8080]">
            {targetedRuns.length} text run{targetedRuns.length === 1 ? "" : "s"} will be removed
          </p>
          <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] leading-4 text-[#c9cdd4]">
            {targetedRuns.slice(0, 8).map((run, index) => (
              <li key={index} className="truncate">{run.str}</li>
            ))}
            {targetedRuns.length > 8 ? <li className="text-[#8b8f98]">and {targetedRuns.length - 8} more…</li> : null}
          </ul>
        </div>
      ) : null}
    </>
  );
}
