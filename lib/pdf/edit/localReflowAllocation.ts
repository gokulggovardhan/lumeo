export type LocalReflowAllocation = {
  lineTexts: string[];
  usedLineCount: number;
};

export type LocalReflowMeasure = (lineIndex: number, text: string) => number | null;

/**
 * Greedily wraps ordinary single-space text into a fixed set of already-owned
 * line widths. It never creates a line, changes a line origin, hyphenates a
 * word, or squeezes glyphs. `measure` is supplied by the PDF font/layout
 * engine, so this module performs no independent font approximation.
 */
export function allocateLocalReflowText({
  text,
  capacitiesPt,
  measure,
  tolerancePt = 0.5,
}: {
  text: string;
  capacitiesPt: readonly number[];
  measure: LocalReflowMeasure;
  tolerancePt?: number;
}): LocalReflowAllocation | null {
  if (capacitiesPt.length < 2 || capacitiesPt.some((value) => !Number.isFinite(value) || value <= 0)) {
    return null;
  }
  if (text.length > 0 && (text !== text.trim() || /[\t\r\n]/u.test(text) || / {2,}/u.test(text))) {
    return null;
  }

  const words = text ? text.split(" ") : [];
  const lineTexts = Array<string>(capacitiesPt.length).fill("");
  let wordIndex = 0;

  for (let lineIndex = 0; lineIndex < capacitiesPt.length; lineIndex += 1) {
    let current = "";
    while (wordIndex < words.length) {
      const candidate = current ? `${current} ${words[wordIndex]}` : words[wordIndex];
      const width = measure(lineIndex, candidate);
      if (width === null || !Number.isFinite(width)) return null;
      if (width <= capacitiesPt[lineIndex] + tolerancePt) {
        current = candidate;
        wordIndex += 1;
        continue;
      }
      if (!current) return null;
      break;
    }
    lineTexts[lineIndex] = current;
    if (wordIndex >= words.length) break;
  }

  if (wordIndex < words.length) return null;
  const lastUsed = lineTexts.reduce((last, value, index) => (value ? index : last), -1);
  return { lineTexts, usedLineCount: lastUsed + 1 };
}
