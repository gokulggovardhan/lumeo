"use client";

import { useCallback, useState } from "react";
import type { CaretTextStyleSnapshot } from "@/lib/pdf/edit/caretTextStyleSnapshot";

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

  const clearSelection = useCallback((closeFormatPanel = true) => {
    setSelectionAnchorIndex(null);
    setSelectedRunIndices([]);
    setEditDraftText("");
    setCaretTextStyleSnapshot(null);
    setEditApplyError("");
    setUseSubstituteFont(false);
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
  }, []);

  const selectDetectedRun = useCallback(
    (
      index: number,
      extend: boolean,
      runs: readonly TextRunLike[],
    ) => {
      const range = contiguousRunRange(selectionAnchorIndex, index, extend);
      if (!extend) setSelectionAnchorIndex(index);
      setSelectedRunIndices(range);
      setEditDraftText(range.map((runIndex) => runs[runIndex]?.str ?? "").join(""));
      setCaretTextStyleSnapshot(null);
      setEditApplyError("");
      setUseSubstituteFont(false);
      if (!extend) setNativeFormatOpen(false);
      return range;
    },
    [selectionAnchorIndex],
  );

  return {
    selectionAnchorIndex,
    setSelectionAnchorIndex,
    selectedRunIndices,
    setSelectedRunIndices,
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
    clearSelection,
    resetInteraction,
    selectDetectedRun,
  };
}
