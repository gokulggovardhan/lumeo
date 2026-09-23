import type { EditElement, TextEditElement } from "./elements.ts";

export type PdfEditGeometry = {
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type PdfEditTextStyle = {
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

export type NativeTextTarget = {
  kind: "native-text";
  pageIndex: number;
  spanIds: string[];
  contentStreamIndex: number | null;
  formPath: string[] | null;
  operatorIndices: number[];
  fontResourceName: string | null;
};

export type ElementTextTarget = {
  kind: "element-text";
  pageIndex: number;
  elementId: string;
};

export type PdfTextTarget = NativeTextTarget | ElementTextTarget;

type OperationBase = {
  id: string;
  sequence: number;
};

export type PdfEditOperation =
  | (OperationBase & {
      kind: "replaceText";
      target: PdfTextTarget;
      originalText: string;
      replacementText: string;
    })
  | (OperationBase & {
      kind: "insertText";
      target: ElementTextTarget;
      text: string;
      style: PdfEditTextStyle;
      geometry: PdfEditGeometry;
    })
  | (OperationBase & {
      kind: "deleteText";
      target: PdfTextTarget;
      originalText: string;
    })
  | (OperationBase & {
      kind: "changeStyle";
      target: PdfTextTarget;
      before: PdfEditTextStyle;
      after: PdfEditTextStyle;
    })
  | (OperationBase & {
      kind: "changeGeometry";
      target: { kind: "element"; pageIndex: number; elementId: string };
      before: PdfEditGeometry;
      after: PdfEditGeometry;
    })
  | (OperationBase & {
      kind: "insertElement";
      element: EditElement;
    })
  | (OperationBase & {
      kind: "deleteElement";
      element: EditElement;
    })
  | (OperationBase & {
      kind: "pageOperation";
      operation: "reorder" | "delete" | "merge" | "redact";
      beforePageCount: number;
      afterPageCount: number;
      affectedPageIndices: number[];
      description: string;
    });

export type PdfEditOperationDraft = PdfEditOperation extends infer Operation
  ? Operation extends OperationBase
    ? Omit<Operation, keyof OperationBase>
    : never
  : never;

export type PdfEditSessionState = {
  sourceByteLength: number;
  nextSequence: number;
  operations: PdfEditOperation[];
};

export function createPdfEditSession(sourceByteLength = 0): PdfEditSessionState {
  return {
    sourceByteLength,
    nextSequence: 1,
    operations: [],
  };
}

export function appendPdfEditOperations(
  session: PdfEditSessionState,
  drafts: readonly PdfEditOperationDraft[],
): PdfEditSessionState {
  if (drafts.length === 0) return session;

  let sequence = session.nextSequence;
  const appended = drafts.map((draft) => {
    const operation = {
      ...draft,
      id: `edit-op-${sequence}`,
      sequence,
    } as PdfEditOperation;
    sequence += 1;
    return operation;
  });

  return {
    ...session,
    nextSequence: sequence,
    operations: [...session.operations, ...appended],
  };
}

function geometryOf(element: EditElement): PdfEditGeometry {
  return {
    pageIndex: element.pageIndex,
    xPct: element.xPct,
    yPct: element.yPct,
    widthPct: element.widthPct,
    heightPct: element.heightPct,
  };
}

function styleOf(element: TextEditElement): PdfEditTextStyle {
  return {
    fontSizePt: element.fontSizePt,
    color: element.color,
    bold: element.bold,
    italic: element.italic,
    underline: element.underline,
  };
}

function sameGeometry(a: PdfEditGeometry, b: PdfEditGeometry): boolean {
  return (
    a.pageIndex === b.pageIndex &&
    a.xPct === b.xPct &&
    a.yPct === b.yPct &&
    a.widthPct === b.widthPct &&
    a.heightPct === b.heightPct
  );
}

function sameStyle(a: PdfEditTextStyle, b: PdfEditTextStyle): boolean {
  return (
    a.fontSizePt === b.fontSizePt &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.fontFamily === b.fontFamily &&
    a.charSpacingPt === b.charSpacingPt &&
    a.wordSpacingPt === b.wordSpacingPt &&
    a.horizontalScalingPct === b.horizontalScalingPct
  );
}

/**
 * Classifies one committed overlay-element transition into semantic edits.
 * It is intentionally pure so EditPdfTool can keep the existing element
 * mutation helpers and history behavior while the session journal gains
 * deterministic meaning.
 */
export function deriveElementOperations(
  before: readonly EditElement[],
  after: readonly EditElement[],
): PdfEditOperationDraft[] {
  const drafts: PdfEditOperationDraft[] = [];
  const beforeById = new Map(before.map((element) => [element.id, element] as const));
  const afterById = new Map(after.map((element) => [element.id, element] as const));

  for (const element of before) {
    if (!afterById.has(element.id)) {
      drafts.push({ kind: "deleteElement", element });
    }
  }

  for (const element of after) {
    const previous = beforeById.get(element.id);
    if (!previous) {
      if (element.type === "text") {
        drafts.push({
          kind: "insertText",
          target: { kind: "element-text", pageIndex: element.pageIndex, elementId: element.id },
          text: element.text,
          style: styleOf(element),
          geometry: geometryOf(element),
        });
      } else {
        drafts.push({ kind: "insertElement", element });
      }
      continue;
    }

    const beforeGeometry = geometryOf(previous);
    const afterGeometry = geometryOf(element);
    if (!sameGeometry(beforeGeometry, afterGeometry)) {
      drafts.push({
        kind: "changeGeometry",
        target: { kind: "element", pageIndex: element.pageIndex, elementId: element.id },
        before: beforeGeometry,
        after: afterGeometry,
      });
    }

    if (previous.type === "text" && element.type === "text") {
      if (previous.text !== element.text) {
        drafts.push(
          element.text.length === 0
            ? {
                kind: "deleteText",
                target: {
                  kind: "element-text",
                  pageIndex: element.pageIndex,
                  elementId: element.id,
                },
                originalText: previous.text,
              }
            : {
                kind: "replaceText",
                target: {
                  kind: "element-text",
                  pageIndex: element.pageIndex,
                  elementId: element.id,
                },
                originalText: previous.text,
                replacementText: element.text,
              },
        );
      }

      const beforeStyle = styleOf(previous);
      const afterStyle = styleOf(element);
      if (!sameStyle(beforeStyle, afterStyle)) {
        drafts.push({
          kind: "changeStyle",
          target: {
            kind: "element-text",
            pageIndex: element.pageIndex,
            elementId: element.id,
          },
          before: beforeStyle,
          after: afterStyle,
        });
      }
    }
  }

  return drafts;
}

export function nativeTextStyleOperation({
  target,
  before,
  after,
}: {
  target: NativeTextTarget;
  before: PdfEditTextStyle;
  after: PdfEditTextStyle;
}): PdfEditOperationDraft {
  return {
    kind: "changeStyle",
    target,
    before,
    after,
  };
}

export function nativeTextOperation({
  pageIndex,
  spanIds,
  contentStreamIndex,
  formPath,
  operatorIndices,
  fontResourceName,
  originalText,
  replacementText,
}: {
  pageIndex: number;
  spanIds: string[];
  contentStreamIndex: number | null;
  formPath: string[] | null;
  operatorIndices: number[];
  fontResourceName: string | null;
  originalText: string;
  replacementText: string;
}): PdfEditOperationDraft {
  const target: NativeTextTarget = {
    kind: "native-text",
    pageIndex,
    spanIds,
    contentStreamIndex,
    formPath,
    operatorIndices,
    fontResourceName,
  };

  return replacementText.length === 0
    ? { kind: "deleteText", target, originalText }
    : { kind: "replaceText", target, originalText, replacementText };
}

export function pageOperation({
  operation,
  beforePageCount,
  afterPageCount,
  affectedPageIndices,
  description,
}: {
  operation: Extract<PdfEditOperation, { kind: "pageOperation" }>["operation"];
  beforePageCount: number;
  afterPageCount: number;
  affectedPageIndices: number[];
  description: string;
}): PdfEditOperationDraft {
  return {
    kind: "pageOperation",
    operation,
    beforePageCount,
    afterPageCount,
    affectedPageIndices: [...affectedPageIndices],
    description,
  };
}
