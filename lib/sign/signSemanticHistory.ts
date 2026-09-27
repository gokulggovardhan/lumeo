import {
  type PdfSemanticGeometry,
  type PdfSemanticHistoryDraft,
  type PdfSemanticState,
  type PdfSemanticTarget,
} from "../pdf/history/semanticHistory.ts";
import {
  isTextLike,
  type PlacedElement,
} from "./types.ts";

function geometryOf(element: PlacedElement): PdfSemanticGeometry {
  return {
    pageIndex: element.pageIndex,
    xPct: element.xPct,
    yPct: element.yPct,
    widthPct: element.widthPct,
    heightPct: element.heightPct,
    rotationDeg: element.rotationDeg,
  };
}

function sameGeometry(a: PlacedElement, b: PlacedElement): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.xPct === b.xPct &&
    a.yPct === b.yPct &&
    a.widthPct === b.widthPct &&
    a.heightPct === b.heightPct &&
    a.rotationDeg === b.rotationDeg
  );
}

function targetOf(element: PlacedElement): PdfSemanticTarget {
  return {
    kind: "element",
    pageIndex: element.pageIndex,
    elementId: element.id,
    elementType: element.type,
  };
}

function stateOf(element: PlacedElement): PdfSemanticState {
  if (isTextLike(element)) {
    return {
      present: true,
      text: element.text,
      geometry: geometryOf(element),
      style: {
        fontSizePt: element.fontSizePt,
      },
    };
  }

  // Signature pixels remain in the existing placed-element history snapshot.
  // The semantic journal intentionally stores no dataUrl/signature image.
  return {
    present: true,
    geometry: geometryOf(element),
  };
}

function insertDraft(element: PlacedElement): PdfSemanticHistoryDraft {
  return {
    tool: "sign",
    type: "insert",
    target: targetOf(element),
    before: null,
    after: stateOf(element),
  };
}

function deleteDraft(element: PlacedElement): PdfSemanticHistoryDraft {
  return {
    tool: "sign",
    type: "delete",
    target: targetOf(element),
    before: stateOf(element),
    after: null,
  };
}

/**
 * Describes one committed Sign workspace transition using the same semantic
 * type/target/before/after vocabulary as Edit, Redaction and Pages.
 *
 * This function does not own undo. SignPdfTool stores the resulting journal
 * inside the existing useHistoryState snapshot, preserving that hook's
 * ref-backed stack as the single authority.
 */
export function deriveSignSemanticHistory(
  before: readonly PlacedElement[],
  after: readonly PlacedElement[],
): PdfSemanticHistoryDraft[] {
  const drafts: PdfSemanticHistoryDraft[] = [];
  const beforeById = new Map(before.map((element) => [element.id, element] as const));
  const afterById = new Map(after.map((element) => [element.id, element] as const));

  for (const element of before) {
    if (!afterById.has(element.id)) {
      drafts.push(deleteDraft(element));
    }
  }

  for (const element of after) {
    const previous = beforeById.get(element.id);
    if (!previous) {
      drafts.push(insertDraft(element));
      continue;
    }

    if (previous.type !== element.type) {
      drafts.push(deleteDraft(previous), insertDraft(element));
      continue;
    }

    if (!sameGeometry(previous, element)) {
      drafts.push({
        tool: "sign",
        type: "change-geometry",
        target: targetOf(element),
        before: { geometry: geometryOf(previous) },
        after: { geometry: geometryOf(element) },
      });
    }

    if (isTextLike(previous) && isTextLike(element)) {
      if (previous.text !== element.text) {
        drafts.push({
          tool: "sign",
          type: "replace-text",
          target: targetOf(element),
          before: { present: true, text: previous.text },
          after: { present: true, text: element.text },
        });
      }
      if (previous.fontSizePt !== element.fontSizePt) {
        drafts.push({
          tool: "sign",
          type: "change-style",
          target: targetOf(element),
          before: { style: { fontSizePt: previous.fontSizePt } },
          after: { style: { fontSizePt: element.fontSizePt } },
        });
      }
    }
  }

  return drafts;
}
