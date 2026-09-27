export type PdfSemanticHistoryTool =
  | "edit"
  | "redaction"
  | "sign"
  | "pages";

export type PdfSemanticHistoryType =
  | "insert"
  | "delete"
  | "replace-text"
  | "change-style"
  | "change-geometry"
  | "reorder-pages"
  | "delete-pages"
  | "merge-pages"
  | "redact"\n  | "add-searchable-text-layer";

export type PdfSemanticGeometry = {
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  rotationDeg?: number;
};

export type PdfSemanticTextStyle = {
  fontFamily?: string;
  fontSizePt?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  charSpacingPt?: number;
  wordSpacingPt?: number;
  horizontalScalingPct?: number;
};

export type PdfSemanticTarget =
  | {
      kind: "text";
      source: "native" | "overlay";
      pageIndex: number;
      ids: string[];
    }
  | {
      kind: "element";
      pageIndex: number;
      elementId: string;
      elementType: string;
    }
  | {
      kind: "pages";
      pageIndices: number[];
    };

export type PdfSemanticState = {
  present?: boolean;
  text?: string;
  geometry?: PdfSemanticGeometry;
  style?: PdfSemanticTextStyle;
  pageCount?: number;
};

export type PdfSemanticHistoryDraft = {
  tool: PdfSemanticHistoryTool;
  type: PdfSemanticHistoryType;
  target: PdfSemanticTarget;
  before: PdfSemanticState | null;
  after: PdfSemanticState | null;
  description?: string;
};

export type PdfSemanticHistoryEntry = PdfSemanticHistoryDraft & {
  id: string;
  sequence: number;
};

export type PdfSemanticHistoryJournal = {
  nextSequence: number;
  entries: PdfSemanticHistoryEntry[];
};

export function createPdfSemanticHistory(): PdfSemanticHistoryJournal {
  return {
    nextSequence: 1,
    entries: [],
  };
}

function cloneTarget(target: PdfSemanticTarget): PdfSemanticTarget {
  if (target.kind === "text") {
    return {
      ...target,
      ids: [...target.ids],
    };
  }
  if (target.kind === "pages") {
    return {
      ...target,
      pageIndices: [...target.pageIndices],
    };
  }
  return { ...target };
}

function cloneState(state: PdfSemanticState | null): PdfSemanticState | null {
  if (!state) return null;
  return {
    ...state,
    ...(state.geometry ? { geometry: { ...state.geometry } } : {}),
    ...(state.style ? { style: { ...state.style } } : {}),
  };
}

/**
 * Appends semantic history without participating in undo authority itself.
 *
 * Callers store this journal inside their EXISTING useHistoryState snapshot,
 * so the proven ref-backed undo/redo stack remains authoritative and the
 * semantic entries simply travel with the same snapshot.
 */
export function appendPdfSemanticHistory(
  journal: PdfSemanticHistoryJournal,
  drafts: readonly PdfSemanticHistoryDraft[],
): PdfSemanticHistoryJournal {
  if (drafts.length === 0) return journal;

  let sequence = journal.nextSequence;
  const appended = drafts.map((draft) => {
    const entry: PdfSemanticHistoryEntry = {
      ...draft,
      id: `semantic-${sequence}`,
      sequence,
      target: cloneTarget(draft.target),
      before: cloneState(draft.before),
      after: cloneState(draft.after),
    };
    sequence += 1;
    return entry;
  });

  return {
    nextSequence: sequence,
    entries: [...journal.entries, ...appended],
  };
}
