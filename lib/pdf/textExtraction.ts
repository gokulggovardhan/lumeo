export type TextItemLike = { str: string };

export function joinTextItems(items: TextItemLike[]): string {
  return items
    .map((item) => item.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEffectivelyEmpty(pageTexts: string[]): boolean {
  return pageTexts.every((text) => text.trim().length === 0);
}

export type PageTextEntry = { page: number; text: string };

export type PageRangeResult = { pages: Set<number> | null; error: string | null };

// Empty input means "no filter" (all pages) -- distinct from a filter that
// matched nothing, which is a real error the caller should surface.
export function parsePageRange(input: string, totalPages: number): PageRangeResult {
  const trimmed = input.trim();
  if (!trimmed) return { pages: null, error: null };

  const pages = new Set<number>();

  for (const rawPart of trimmed.split(",")) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-").map((piece) => piece.trim());
      const start = Number.parseInt(startRaw, 10);
      const end = Number.parseInt(endRaw, 10);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
        return { pages: null, error: `"${part}" isn't a valid page range.` };
      }
      for (let page = start; page <= Math.min(end, totalPages); page += 1) pages.add(page);
    } else {
      const page = Number.parseInt(part, 10);
      if (!Number.isInteger(page) || page < 1) {
        return { pages: null, error: `"${part}" isn't a valid page number.` };
      }
      if (page <= totalPages) pages.add(page);
    }
  }

  if (pages.size === 0) return { pages: null, error: "No pages matched that range." };
  return { pages, error: null };
}

export function selectPageEntries(pageTexts: string[], pages: Set<number> | null): PageTextEntry[] {
  return pageTexts
    .map((text, index) => ({ page: index + 1, text }))
    .filter((entry) => !pages || pages.has(entry.page));
}

export function buildTxtFromEntries(entries: PageTextEntry[]): string {
  return entries.map((entry) => `--- Page ${entry.page} ---\n${entry.text}`).join("\n\n");
}

export function buildJsonFromEntries(entries: PageTextEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCsvFromEntries(entries: PageTextEntry[]): string {
  return ["page,text", ...entries.map((entry) => `${entry.page},${csvEscape(entry.text)}`)].join("\n");
}
