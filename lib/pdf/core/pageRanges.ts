// lib/pdf/core/pageRanges.ts
//
// Shared page-range selection, parsing, and resolution -- used by any tool
// that applies content to a subset of a document's pages (Watermark today;
// Page Numbers, Header & Footer, Images next). Self-contained (no
// project-file imports), same Node-test-runner constraint as
// lib/pdf/core/anchors.ts.

export type PageRangeSelector =
  | { mode: "all" }
  | { mode: "first" }
  | { mode: "odd" }
  | { mode: "even" }
  | { mode: "custom"; pages: number[] }; // zero-based page indices

// Parses a 1-based, human-entered page range string ("1-3,5,7-9") into
// zero-based page indices, clamped to [0, pageCount). Returns null if the
// input has no valid tokens (distinguishes "nothing selected" from "empty
// document"), so callers can show a validation error rather than silently
// exporting to zero pages.
export function parsePageRangeInput(input: string, pageCount: number): number[] | null {
  const indices = new Set<number>();

  for (const rawToken of input.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;

    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number.parseInt(rangeMatch[1], 10);
      const end = Number.parseInt(rangeMatch[2], 10);
      const [low, high] = start <= end ? [start, end] : [end, start];
      for (let page = low; page <= high; page += 1) {
        if (page >= 1 && page <= pageCount) indices.add(page - 1);
      }
      continue;
    }

    const single = Number.parseInt(token, 10);
    if (Number.isFinite(single) && single >= 1 && single <= pageCount) {
      indices.add(single - 1);
    }
  }

  if (indices.size === 0) return null;
  return Array.from(indices).sort((a, b) => a - b);
}

// Resolves a PageRangeSelector into concrete zero-based page indices for a
// document with the given page count.
export function resolvePageIndices(pageRange: PageRangeSelector, pageCount: number): number[] {
  switch (pageRange.mode) {
    case "all":
      return Array.from({ length: pageCount }, (_, index) => index);
    case "first":
      return pageCount > 0 ? [0] : [];
    case "odd":
      return Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 0);
    case "even":
      return Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 1);
    case "custom":
      return pageRange.pages.filter((index) => index >= 0 && index < pageCount);
    default:
      return [];
  }
}
