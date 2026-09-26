"use client";

import { useState } from "react";
import type { CaretTextStyleSnapshot } from "@/lib/pdf/edit/caretTextStyleSnapshot";

/**
 * Existing Edit PDF range semantics, extracted without changing them:
 * - plain selection always selects one run;
 * - Shift+selection grows one contiguous inclusive range from the most recent
 *   plain-selection anchor;
 * - reverse extension returns indices in document order.
 *
 * This remains run-index based on purpose. Phase 2.3 will introduce the
 * PDF-aware logical caret/range model through this seam rather than coupling
 * that behavior change to the component-decomposition PR.
 */
export function contiguousNativeTextSelectionRange(
  anchorIndex: number | null,
  index: number,
  extend: boolean,
): number[] {
  if (!extend || anchorIndex === null) return [index];

  const first = Math.min(anchorIndex, index);
  const last = Math.max(anchorIndex, index);
  return Array.from({ length: last - first + 1 }, (_unused, offset) => first + offset);
}

/**
 * Owns only the presentation/orchestration state for native-text selection.
 * PDF detection, reconciliation, font/glyph authority, EditPlan validation,
 * write-back and iOS trusted-gesture focus timing stay in EditPdfTool.
 *
 * Setters are exposed during this incremental extraction so call sites retain
 * exactly the same transitions. Later decomposition slices can move one
 * transition at a time behind narrower actions after the existing browser
 * regression suite proves each step.
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
  };
}
