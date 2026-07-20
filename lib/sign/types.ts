// lib/sign/types.ts
//
// Shared types for the Sign PDF workspace -- the signature library
// (persisted), and placed elements (in-memory, per session).

export type SignatureSourceKind = "draw" | "type" | "upload";

export type SavedSignature = {
  id: string;
  name: string;
  dataUrl: string;
  aspectRatio: number;
  source: SignatureSourceKind;
  isDefault: boolean;
  createdAt: number;
  lastUsedAt: number | null;
};

export type PlacedElementType = "signature" | "date" | "text" | "initials";

export type PlacedElementBase = {
  id: string;
  type: PlacedElementType;
  pageIndex: number;
  // Percent of the page's rendered width/height -- resolution independent.
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  rotationDeg: number;
};

export type SignatureElement = PlacedElementBase & {
  type: "signature";
  signatureId: string;
  dataUrl: string;
  aspectRatio: number;
};

export type TextLikeElement = PlacedElementBase & {
  type: "date" | "text" | "initials";
  text: string;
  fontSizePt: number;
};

export type PlacedElement = SignatureElement | TextLikeElement;

export function isTextLike(element: PlacedElement): element is TextLikeElement {
  return element.type !== "signature";
}
