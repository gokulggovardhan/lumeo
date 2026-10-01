import type { WorkspaceArea } from "./model.ts";

export type DocumentHealthInput = {
  byteLength: number;
  pageCount: number;
  hasSearchableText?: boolean | null;
  scannedPageCount?: number | null;
  rotatedPageCount?: number | null;
  imageHeavy?: boolean | null;
};

export type DocumentHealthSuggestion = {
  id: "compress" | "ocr" | "rotate" | "optimize-images";
  area: WorkspaceArea;
  label: string;
  detail: string;
  priority: 1 | 2 | 3;
};

const LARGE_FILE_BYTES = 25 * 1024 * 1024;

export function getDocumentHealthSuggestions(
  input: DocumentHealthInput,
): DocumentHealthSuggestion[] {
  const suggestions: DocumentHealthSuggestion[] = [];

  if (input.byteLength >= LARGE_FILE_BYTES) {
    suggestions.push({
      id: "compress",
      area: "optimize",
      label: "Large PDF",
      detail: "Compress after you finish if you need a smaller file.",
      priority: 2,
    });
  }

  if (
    input.hasSearchableText === false ||
    (input.scannedPageCount ?? 0) > 0
  ) {
    suggestions.push({
      id: "ocr",
      area: "enhance",
      label: "Scanned document",
      detail: "OCR can make scanned text searchable and selectable.",
      priority: 1,
    });
  }

  if ((input.rotatedPageCount ?? 0) > 0) {
    suggestions.push({
      id: "rotate",
      area: "pages",
      label: "Page orientation",
      detail: "Some pages appear rotated. Review them in Pages before finishing.",
      priority: 1,
    });
  }

  if (input.imageHeavy === true) {
    suggestions.push({
      id: "optimize-images",
      area: "optimize",
      label: "Image-heavy PDF",
      detail: "Compression may reduce image weight without changing your edits.",
      priority: 3,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}
