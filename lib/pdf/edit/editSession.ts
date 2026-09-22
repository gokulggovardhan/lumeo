import type { EditElement, TextEditElement } from "./elements.ts";

export type PdfEditGeometry = {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type PdfTextStyleSnapshot = {
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type NativeTextSourceRef = {
  kind: "native";
  pageIndex: number;
  spanIds: string[];
  operators: Array<{
    streamKind: "page" | "xobject";
    contentStreamIndex: number;
    formPath: string[] | null;
    operatorIndex: number;
  }>;
};

export type PlacedTextSourceRef = {
  kind: "placed";
  pageIndex: number;
  elementId: string;
};

export type PdfTextTargetRef = NativeTextSourceRef | PlacedTextSourceRef;

type PdfEditOperationBase = {
  id: string;
  sequence: number;
  pageIndex: number;
};

export type ReplaceTextOperation = PdfEditOperationBase & {
  kind: "replaceText";
  target: PdfTextTargetRef;
  beforeText: string;
  afterText: string;
  layoutStrategy: string | null;
};

export type InsertTextOperation = PdfEditOperationBase & {
  kind: "insertText";
  target: PlacedTextSourceRef;
  text: string;
  geometry: PdfEditGeometry;
  style: PdfTextStyleSnapshot;
};

export type DeleteTextOperation = PdfEditOperationBase & {
  kind: "deleteText";
  target: PdfTextTargetRef;
  beforeText: string;
};

export type ChangeTextStyleOperation = PdfEditOperationBase & {
  kind: "changeStyle";
  target: PlacedTextSourceRef;
  before: PdfTextStyleSnapshot;
  after: PdfTextStyleSnapshot;
};

export type ChangeGeometryOperation = PdfEditOperationBase & {
  kind: "changeGeometry";
  target: { kind: "element"; elementId: string; elementType: EditElement["type"] };
  before: PdfEditGeometry;
  after: PdfEditGeometry;
};

export type ElementLifecycleOperation = PdfEditOperationBase & {
  kind: "elementLifecycle";
  action: "insert" | "delete";
  elementId: string;
  elementType: EditElement["type"];
};

export type PageEditOperation = PdfEditOperationBase & {
  kind: "pageOperation";
  action: "reorder" | "delete" | "merge" | "rotate" | "redact";
  detail: Record<string, string | number | boolean | number[]>;
};

export type PdfEditOperation =
  | ReplaceTextOperation
  | InsertTextOperation
  | DeleteTextOperation
  | ChangeTextStyleOperation
  | ChangeGeometryOperation
  | ElementLifecycleOperation
  | PageEditOperation;

export type PdfEditOperationDraft = PdfEditOperation extends infer T
  ? T extends PdfEditOperation
    ? Omit<T, "id" | "sequence">
    : never
  : never;

export type PdfEditJournal = {
  version: 1;
  nextSequence: number;
  operations: PdfEditOperation[];
};

export function createPdfEditJournal(): PdfEditJournal {
  return { version: 1, nextSequence: 1, operations: [] };
}

export function appendPdfEditOperation(
  journal: PdfEditJournal,
  draft: PdfEditOperationDraft,
): PdfEditJournal {
  const sequence = journal.nextSequence;
  const operation = {
    ...draft,
    id: `edit-op-${sequence}`,
    sequence,
  } as PdfEditOperation;
  return {
    version: 1,
    nextSequence: sequence + 1,
    operations: [...journal.operations, operation],
  };
}

function geometryOf(element: EditElement): PdfEditGeometry {
  return {
    xPct: element.xPct,
    yPct: element.yPct,
    widthPct: element.widthPct,
    heightPct: element.heightPct,
  };
}

function textStyleOf(element: TextEditElement): PdfTextStyleSnapshot {
  return {
    fontSizePt: element.fontSizePt,
    color: element.color,
    bold: element.bold,
    italic: element.italic,
    underline: element.underline,
  };
}

function sameGeometry(a: PdfEditGeometry, b: PdfEditGeometry): boolean {
  return a.xPct === b.xPct && a.yPct === b.yPct && a.widthPct === b.widthPct && a.heightPct === b.heightPct;
}

function sameStyle(a: PdfTextStyleSnapshot, b: PdfTextStyleSnapshot): boolean {
  return (
    a.fontSizePt === b.fontSizePt &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline
  );
}

/**
 * Appends semantic operations for one committed placed-element mutation.
 *
 * EditElementView already commits drag/resize only once at gesture end, so
 * callers may safely run this over before/after arrays without creating a
 * journal entry for every pointermove frame.
 */
export function recordElementMutation(
  journal: PdfEditJournal,
  before: readonly EditElement[],
  after: readonly EditElement[],
): PdfEditJournal {
  let next = journal;
  const beforeById = new Map(before.map((element) => [element.id, element] as const));
  const afterById = new Map(after.map((element) => [element.id, element] as const));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

  for (const id of ids) {
    const previous = beforeById.get(id);
    const current = afterById.get(id);

    if (!previous && current) {
      if (current.type === "text") {
        next = appendPdfEditOperation(next, {
          kind: "insertText",
          pageIndex: current.pageIndex,
          target: { kind: "placed", pageIndex: current.pageIndex, elementId: current.id },
          text: current.text,
          geometry: geometryOf(current),
          style: textStyleOf(current),
        });
      } else {
        next = appendPdfEditOperation(next, {
          kind: "elementLifecycle",
          action: "insert",
          pageIndex: current.pageIndex,
          elementId: current.id,
          elementType: current.type,
        });
      }
      continue;
    }

    if (previous && !current) {
      if (previous.type === "text") {
        next = appendPdfEditOperation(next, {
          kind: "deleteText",
          pageIndex: previous.pageIndex,
          target: { kind: "placed", pageIndex: previous.pageIndex, elementId: previous.id },
          beforeText: previous.text,
        });
      } else {
        next = appendPdfEditOperation(next, {
          kind: "elementLifecycle",
          action: "delete",
          pageIndex: previous.pageIndex,
          elementId: previous.id,
          elementType: previous.type,
        });
      }
      continue;
    }

    if (!previous || !current) continue;

    const beforeGeometry = geometryOf(previous);
    const afterGeometry = geometryOf(current);
    if (!sameGeometry(beforeGeometry, afterGeometry)) {
      next = appendPdfEditOperation(next, {
        kind: "changeGeometry",
        pageIndex: current.pageIndex,
        target: { kind: "element", elementId: current.id, elementType: current.type },
        before: beforeGeometry,
        after: afterGeometry,
      });
    }

    if (previous.type === "text" && current.type === "text") {
      const target: PlacedTextSourceRef = {
        kind: "placed",
        pageIndex: current.pageIndex,
        elementId: current.id,
      };
      if (previous.text !== current.text) {
        next = appendPdfEditOperation(next, {
          kind: current.text.length === 0 ? "deleteText" : "replaceText",
          pageIndex: current.pageIndex,
          target,
          ...(current.text.length === 0
            ? { beforeText: previous.text }
            : {
                beforeText: previous.text,
                afterText: current.text,
                layoutStrategy: null,
              }),
        } as PdfEditOperationDraft);
      }
      const beforeStyle = textStyleOf(previous);
      const afterStyle = textStyleOf(current);
      if (!sameStyle(beforeStyle, afterStyle)) {
        next = appendPdfEditOperation(next, {
          kind: "changeStyle",
          pageIndex: current.pageIndex,
          target,
          before: beforeStyle,
          after: afterStyle,
        });
      }
    }
  }

  return next;
}

/**
 * Immutable owner for uploaded source bytes + semantic edit journal.
 * getSourcePdfBytes() always returns a copy; callers cannot mutate the
 * session baseline accidentally while pdf-lib/pdf.js work on live caches.
 */
export class PdfEditSession {
  private readonly sourceBytes: Uint8Array;
  readonly journal: PdfEditJournal;

  constructor(source: ArrayBuffer | Uint8Array, journal = createPdfEditJournal()) {
    const bytes =
      source instanceof Uint8Array
        ? new Uint8Array(source)
        : new Uint8Array(source.slice(0));
    this.sourceBytes = bytes;
    this.journal = journal;
  }

  getSourcePdfBytes(): ArrayBuffer {
    const copy = new Uint8Array(this.sourceBytes);
    return copy.buffer;
  }

  withOperation(draft: PdfEditOperationDraft): PdfEditSession {
    return new PdfEditSession(this.sourceBytes, appendPdfEditOperation(this.journal, draft));
  }

  withJournal(journal: PdfEditJournal): PdfEditSession {
    return new PdfEditSession(this.sourceBytes, journal);
  }
}
