import type { PercentBox } from "./coordinateMapper.ts";
import type {
  PdfPageTextModel,
  PdfTextCapability,
  PdfTextLine,
  PdfTextSpan,
} from "./documentModel.ts";

export type PdfTextSearchScope = "page" | "document";

export type PdfTextSearchOptions = {
  caseSensitive?: boolean;
  wholeWord?: boolean;
};

export type PdfTextSearchMatch = {
  id: string;
  pageIndex: number;
  lineId: string;
  text: string;
  start: number;
  end: number;
  spanIds: string[];
  sourceRunIndices: number[];
  boundsPct: PercentBox;
  capability: "editable" | "partially-editable" | "view-only";
  capabilityReason: string | null;
};

function unionBoxes(spans: readonly PdfTextSpan[]): PercentBox {
  const left = Math.min(...spans.map((span) => span.boundsPct.xPct));
  const top = Math.min(...spans.map((span) => span.boundsPct.yPct));
  const right = Math.max(...spans.map((span) => span.boundsPct.xPct + span.boundsPct.widthPct));
  const bottom = Math.max(...spans.map((span) => span.boundsPct.yPct + span.boundsPct.heightPct));
  return { xPct: left, yPct: top, widthPct: right - left, heightPct: bottom - top };
}

function isEditableCapability(capability: PdfTextCapability): boolean {
  return capability === "native-editable" || capability === "fragmented-editable";
}

function matchCapability(spans: readonly PdfTextSpan[]): Pick<
  PdfTextSearchMatch,
  "capability" | "capabilityReason"
> {
  const editable = spans.filter((span) => isEditableCapability(span.capability)).length;
  if (editable === spans.length) return { capability: "editable", capabilityReason: null };
  if (editable > 0) {
    return {
      capability: "partially-editable",
      capabilityReason:
        "This match crosses text that is not fully safe to rewrite. Replace is disabled until every span is editable.",
    };
  }
  return {
    capability: "view-only",
    capabilityReason:
      spans.map((span) => span.capabilityReason).find(Boolean) ??
      "This match is searchable but not safely editable in place.",
  };
}

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function wholeWordAt(text: string, start: number, end: number): boolean {
  return !isWordChar(text[start - 1]) && !isWordChar(text[end]);
}

function spansForRange(line: PdfTextLine, start: number, end: number): PdfTextSpan[] {
  const ids = new Set(
    line.segments
      .filter((segment) => segment.end > start && segment.start < end)
      .map((segment) => segment.spanId),
  );
  return line.spans.filter((span) => ids.has(span.id));
}

export function searchPdfPageText(
  page: PdfPageTextModel,
  query: string,
  options: PdfTextSearchOptions = {},
): PdfTextSearchMatch[] {
  const rawQuery = query.trim();
  if (!rawQuery) return [];

  const needle = options.caseSensitive ? rawQuery : rawQuery.toLocaleLowerCase();
  const results: PdfTextSearchMatch[] = [];

  for (const line of page.lines) {
    const haystack = options.caseSensitive ? line.text : line.text.toLocaleLowerCase();
    let from = 0;
    let ordinal = 0;

    while (from <= haystack.length - needle.length) {
      const start = haystack.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      from = Math.max(end, start + 1);

      if (options.wholeWord && !wholeWordAt(line.text, start, end)) continue;

      const spans = spansForRange(line, start, end);
      if (spans.length === 0) continue;
      const capability = matchCapability(spans);

      results.push({
        id: `p${page.pageIndex}-${line.id}-match-${ordinal}`,
        pageIndex: page.pageIndex,
        lineId: line.id,
        text: line.text.slice(start, end),
        start,
        end,
        spanIds: spans.map((span) => span.id),
        sourceRunIndices: spans.map((span) => span.sourceRunIndex),
        boundsPct: unionBoxes(spans),
        capability: capability.capability,
        capabilityReason: capability.capabilityReason,
      });
      ordinal += 1;
    }
  }

  return results;
}

export function searchPdfDocumentText(
  pages: readonly PdfPageTextModel[],
  query: string,
  options: PdfTextSearchOptions = {},
): PdfTextSearchMatch[] {
  return [...pages]
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .flatMap((page) => searchPdfPageText(page, query, options));
}

export function nextSearchMatchIndex(
  matches: readonly PdfTextSearchMatch[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (matches.length === 0) return -1;
  if (currentIndex < 0 || currentIndex >= matches.length) {
    return direction === 1 ? 0 : matches.length - 1;
  }
  return (currentIndex + direction + matches.length) % matches.length;
}


export function replacementTextForSearchMatch(
  page: PdfPageTextModel,
  match: PdfTextSearchMatch,
  replacement: string,
): { sourceRunIndices: number[]; replacementText: string } | null {
  if (match.pageIndex !== page.pageIndex || match.capability !== "editable") return null;
  const line = page.lines.find((candidate) => candidate.id === match.lineId);
  if (!line) return null;

  const relevantSegments = line.segments.filter(
    (segment) => segment.end > match.start && segment.start < match.end,
  );
  if (relevantSegments.length === 0) return null;

  const spanById = new Map(line.spans.map((span) => [span.id, span] as const));
  const firstSegment = relevantSegments[0];
  const lastSegment = relevantSegments[relevantSegments.length - 1];
  const firstSpan = spanById.get(firstSegment.spanId);
  const lastSpan = spanById.get(lastSegment.spanId);
  if (!firstSpan || !lastSpan) return null;

  const localStart = Math.max(0, match.start - firstSegment.start);
  const localEnd = Math.max(0, Math.min(lastSpan.text.length, match.end - lastSegment.start));
  const prefix = firstSpan.text.slice(0, localStart);
  const suffix = lastSpan.text.slice(localEnd);

  const sourceRunIndices = relevantSegments.map((segment) => segment.sourceRunIndex);
  if (new Set(sourceRunIndices).size !== sourceRunIndices.length) return null;

  return {
    sourceRunIndices,
    replacementText: prefix + replacement + suffix,
  };
}
