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

export function buildTxtFile(pageTexts: string[]): string {
  return pageTexts
    .map((text, index) => `--- Page ${index + 1} ---\n${text}`)
    .join("\n\n");
}
