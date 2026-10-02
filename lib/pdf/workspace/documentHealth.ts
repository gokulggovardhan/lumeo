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
      label: "This PDF is quite large",
      detail: "Reduce size if you want a smaller final file.",
      priority: 2,
    });
  }

  if (
    input.hasSearchableText === false ||
    (input.hasSearchableText !== true && (input.scannedPageCount ?? 0) > 0)
  ) {
    suggestions.push({
      id: "ocr",
      area: "edit",
      label: "Scanned page detected",
      detail: "Recognize text to make this page searchable and selectable.",
      priority: 1,
    });
  }

  if ((input.rotatedPageCount ?? 0) > 0) {
    suggestions.push({
      id: "rotate",
      area: "pages",
      label: "Some pages appear rotated",
      detail: "Review and fix rotation in Pages.",
      priority: 1,
    });
  }

  if (input.imageHeavy === true) {
    suggestions.push({
      id: "optimize-images",
      area: "optimize",
      label: "Image-heavy PDF",
      detail: "Reduce size may help with image-heavy pages.",
      priority: 3,
    });
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}
