"use client";

import { useCallback, useState } from "react";
import type { CaretTextStyleSnapshot } from "@/lib/pdf/edit/caretTextStyleSnapshot";
import type { PdfPageTextModel, PdfTextSpan } from "@/lib/pdf/edit/documentModel";
import {
  logicalRangeForFullRunSelection,
  logicalRangeForSingleSpan,
  type LogicalTextDirection,
  type LogicalTextRange,
} from "@/lib/pdf/edit/logicalTextRange";

type TextRunLike = Readonly<{ str: string }>;

export function contiguousRunRange(
  anchorIndex: number | null,
  targetIndex: number,
  extend: boolean,
): number[] {
  if (!extend || anchorIndex === null) return [targetIndex];
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return Array.from({ length: end - start + 1 }, (_unused, offset) => start + offset);
}

/**
 * Owns the transient UI state for native-PDF text selection/editing.
 *
 * PDF evidence and mutation authority deliberately stay outside this hook:
 * matching, arbitration, EditPlan construction, glyph checks, content-stream
 * writes, history snapshots and export remain in EditPdfTool/lib/pdf/edit.
 * This seam exists so Phase 2.3 can replace run-index selection with a
 * PDF-aware logical caret/range model without another monolithic component
 * rewrite.
 */
export function useNativeTextSelectionState() {
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [selectedRunIndices, setSelectedRunIndices] = useState<number[]>([]);
  const [hoveredRunIndex, setHoveredRunIndex] = useState(-1);
  const [focusedRunIndex, setFocusedRunIndex] = useState<number | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [caretTextStyleSnapshot, setCaretTextStyleSnapshot] =
    useState<CaretTextStyleSnapshot | null>(null);
  const [useSubstituteFont, setUseSubstituteFont] = useState(false);
  const [editApplyError, setEditApplyError] = useState("");
  const [nativeFormatOpen, setNativeFormatOpen] = useState(false);
  const [logicalSelection, setLogicalSelection] = useState<LogicalTextRange | null>(null);

  const clearSelection = useCallback((closeFormatPanel = true) => {
    setSelectionAnchorIndex(null);
    setSelectedRunIndices([]);
    setEditDraftText("");
    setCaretTextStyleSnapshot(null);
    setEditApplyError("");
    setUseSubstituteFont(false);
    setLogicalSelection(null);
    if (closeFormatPanel) setNativeFormatOpen(false);
  }, []);

  const resetInteraction = useCallback(() => {
    setSelectionAnchorIndex(null);
    setSelectedRunIndices([]);
    setHoveredRunIndex(-1);
    setFocusedRunIndex(null);
    setEditDraftText("");
    setCaretTextStyleSnapshot(null);
    setEditApplyError("");
    setUseSubstituteFont(false);
    setLogicalSelection(null);
  }, []);

  const selectDetectedRun = useCallback(
    (
      index: number,
      extend: boolean,
      runs: readonly TextRunLike[],
      pageTextModel: PdfPageTextModel | null,
    ) => {
      const range = contiguousRunRange(selectionAnchorIndex, index, extend);
      const anchorIndex =
        extend && selectionAnchorIndex !== null ? selectionAnchorIndex : index;
      if (!extend) setSelectionAnchorIndex(index);
      setSelectedRunIndices(range);
      setEditDraftText(range.map((runIndex) => runs[runIndex]?.str ?? "").join(""));
      setLogicalSelection(
        pageTextModel
          ? logicalRangeForFullRunSelection(pageTextModel, anchorIndex, index)
          : null,
      );
      setCaretTextStyleSnapshot(null);
      setEditApplyError("");
      setUseSubstituteFont(false);
      if (!extend) setNativeFormatOpen(false);
      return range;
    },
    [selectionAnchorIndex],
  );

  const selectRunIndices = useCallback(
    ({
      indices,
      runs,
      pageTextModel,
      draftText,
    }: {
      indices: readonly number[];
      runs: readonly TextRunLike[];
      pageTextModel: PdfPageTextModel | null;
      draftText?: string;
    }) => {
      if (indices.length === 0) {
        clearSelection();
        return;
      }
      const ordered = [...new Set(indices)].sort((a, b) => a - b);
      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      setSelectionAnchorIndex(first);
      setSelectedRunIndices(ordered);
      const nextDraft =
        draftText ?? ordered.map((runIndex) => runs[runIndex]?.str ?? "").join("");
      setEditDraftText(nextDraft);
      const singleSpan =
        ordered.length === 1
          ? pageTextModel?.spans.find((span) => span.sourceRunIndex === first) ?? null
          : null;
      setLogicalSelection(
        singleSpan
          ? logicalRangeForSingleSpan({
              span: singleSpan,
              text: nextDraft,
              selectionStart: 0,
              selectionEnd: nextDraft.length,
            })
          : pageTextModel
            ? logicalRangeForFullRunSelection(pageTextModel, first, last)
            : null,
      );
      setCaretTextStyleSnapshot(null);
      setEditApplyError("");
      setUseSubstituteFont(false);
      setNativeFormatOpen(false);
    },
    [clearSelection],
  );

  const updateSingleSpanLogicalSelection = useCallback(
    ({
      span,
      text,
      selectionStart,
      selectionEnd,
      direction,
    }: {
      span: Pick<PdfTextSpan, "id" | "sourceRunIndex">;
      text: string;
      selectionStart: number;
      selectionEnd: number;
      direction?: LogicalTextDirection;
    }) => {
      const next = logicalRangeForSingleSpan({
        span,
        text,
        selectionStart,
        selectionEnd,
        direction,
      });
      setLogicalSelection(next);
      return next;
    },
    [],
  );

  return {
    selectionAnchorIndex,
    selectedRunIndices,
    hoveredRunIndex,
    setHoveredRunIndex,
    focusedRunIndex,
    setFocusedRunIndex,
    editDraftText,
    setEditDraftText,
    caretTextStyleSnapshot,
    setCaretTextStyleSnapshot,
    useSubstituteFont,
    setUseSubstituteFont,
    editApplyError,
    setEditApplyError,
    nativeFormatOpen,
    setNativeFormatOpen,
    logicalSelection,
    clearSelection,
    resetInteraction,
    selectDetectedRun,
    selectRunIndices,
    updateSingleSpanLogicalSelection,
  };
}
