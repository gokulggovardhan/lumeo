// lib/pdf/edit/elements.ts
//
// Self-contained (no project-file imports) so this module can run directly
// under `node --experimental-strip-types` for tests, exactly like
// lib/pdf/pageOrganizer.ts and lib/pdf/textExtraction.ts do -- see those
// files' top comments for why a pure logic module in this codebase avoids
// importing other project files.
//
// Coordinates are percent of the rendered page (0-100), matching
// lib/sign/types.ts's PlacedElementBase -- zoom/resolution independent,
// converted to PDF points only at export time (lib/pdf/edit/export.ts).

export type ShapeKind = "rect" | "ellipse" | "line" | "highlight";

export type EditElementBase = {
  id: string;
  pageIndex: number;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type TextEditElement = EditElementBase & {
  type: "text";
  text: string;
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
};

export type ShapeEditElement = EditElementBase & {
  type: "shape";
  shapeKind: ShapeKind;
  color: string;
  opacity: number;
};

export type WhiteoutEditElement = EditElementBase & {
  type: "whiteout";
  color: "white" | "black";
};

export type InkEditElement = EditElementBase & {
  type: "ink";
  pngDataUrl: string;
};

export type EditElement = TextEditElement | ShapeEditElement | WhiteoutEditElement | InkEditElement;

const DEFAULT_TEXT_WIDTH_PCT = 20;
const DEFAULT_TEXT_HEIGHT_PCT = 4;
const DEFAULT_FONT_SIZE_PT = 14;
const DEFAULT_SHAPE_WIDTH_PCT = 18;
const DEFAULT_SHAPE_HEIGHT_PCT = 10;
const DEFAULT_WHITEOUT_WIDTH_PCT = 20;
const DEFAULT_WHITEOUT_HEIGHT_PCT = 6;
const HIGHLIGHT_OPACITY = 0.35;
const SHAPE_OPAQUE = 1;

export function createTextElement(id: string, pageIndex: number, xPct: number, yPct: number): TextEditElement {
  return {
    id,
    type: "text",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_TEXT_WIDTH_PCT,
    heightPct: DEFAULT_TEXT_HEIGHT_PCT,
    text: "",
    fontSizePt: DEFAULT_FONT_SIZE_PT,
    color: "#12141a",
    bold: false,
    italic: false,
  };
}

export function createShapeElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  shapeKind: ShapeKind,
): ShapeEditElement {
  return {
    id,
    type: "shape",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_SHAPE_WIDTH_PCT,
    heightPct: shapeKind === "line" ? 0.5 : DEFAULT_SHAPE_HEIGHT_PCT,
    shapeKind,
    color: shapeKind === "highlight" ? "#ffe066" : "#e03131",
    opacity: shapeKind === "highlight" ? HIGHLIGHT_OPACITY : SHAPE_OPAQUE,
  };
}

export function createWhiteoutElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  color: "white" | "black" = "white",
): WhiteoutEditElement {
  return {
    id,
    type: "whiteout",
    pageIndex,
    xPct,
    yPct,
    widthPct: DEFAULT_WHITEOUT_WIDTH_PCT,
    heightPct: DEFAULT_WHITEOUT_HEIGHT_PCT,
    color,
  };
}

export function createInkElement(
  id: string,
  pageIndex: number,
  xPct: number,
  yPct: number,
  widthPct: number,
  heightPct: number,
  pngDataUrl: string,
): InkEditElement {
  return { id, type: "ink", pageIndex, xPct, yPct, widthPct, heightPct, pngDataUrl };
}

export function canResizeElement(element: EditElement): boolean {
  return element.type !== "ink";
}

export function isLineShape(element: EditElement): boolean {
  return element.type === "shape" && element.shapeKind === "line";
}

export function patchElement(elements: EditElement[], id: string, patch: Partial<EditElement>): EditElement[] {
  return elements.map((item) => (item.id === id ? ({ ...item, ...patch } as EditElement) : item));
}

export function deleteElement(elements: EditElement[], id: string): EditElement[] {
  return elements.filter((item) => item.id !== id);
}

export function elementsForPage(elements: EditElement[], pageIndex: number): EditElement[] {
  return elements.filter((item) => item.pageIndex === pageIndex);
}
