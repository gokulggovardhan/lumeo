// bench/ocr-gate2/evaluate.ts
//
// Character and Word Error Rate, the two numbers Gate 2 turns on.
//
// Pure: no filesystem, no Tesseract, no canvas. That is deliberate -- the
// harness around it is slow and environment-dependent, but the arithmetic
// that decides whether OCR is accurate enough to ship is the part that must
// be provably right, so it lives here on its own and has unit tests
// (tests/ocr-gate2-evaluate.test.ts) that run in the normal suite.

/**
 * Unicode normalisation matters more here than it looks. Tesseract emits
 * precomposed characters (NFC), but ground truth written by hand -- or
 * pasted from a PDF extraction -- can carry decomposed sequences (NFD). An
 * "é" that is one code point in one string and two in the other counts as a
 * substitution PLUS an insertion, inflating CER on text that is in fact
 * identical. Normalising both sides to NFC removes that phantom error.
 */
export type NormalizeOptions = {
  /** Collapse runs of whitespace to a single space and trim. Default true. */
  collapseWhitespace?: boolean;
  /** Compare case-insensitively. Default false -- case errors are real errors. */
  ignoreCase?: boolean;
  /**
   * Unicode normalisation form applied to BOTH strings. NFC is the right
   * default: it is what Tesseract produces and what most PDF text layers
   * carry. NFD is offered for corpora that are canonically decomposed.
   */
  form?: "NFC" | "NFD";
};

export function normalizeText(value: string, options: NormalizeOptions = {}): string {
  const { collapseWhitespace = true, ignoreCase = false, form = "NFC" } = options;
  let out = value.normalize(form);
  if (collapseWhitespace) out = out.replace(/\s+/g, " ").trim();
  if (ignoreCase) out = out.toLowerCase();
  return out;
}

/**
 * Levenshtein distance over an arbitrary token sequence -- characters for
 * CER, words for WER, the same algorithm either way.
 *
 * Two rows rather than a full matrix: a 300-DPI page can carry a few
 * thousand characters, and the full matrix would be tens of millions of
 * cells per fixture for no benefit, since only the distance is needed and
 * not the alignment path.
 */
export function levenshtein<T>(reference: readonly T[], hypothesis: readonly T[]): number {
  if (reference.length === 0) return hypothesis.length;
  if (hypothesis.length === 0) return reference.length;

  let previous = new Array<number>(hypothesis.length + 1);
  let current = new Array<number>(hypothesis.length + 1);
  for (let j = 0; j <= hypothesis.length; j += 1) previous[j] = j;

  for (let i = 1; i <= reference.length; i += 1) {
    current[0] = i;
    const refToken = reference[i - 1];
    for (let j = 1; j <= hypothesis.length; j += 1) {
      const substitution = previous[j - 1] + (refToken === hypothesis[j - 1] ? 0 : 1);
      const deletion = previous[j] + 1;
      const insertion = current[j - 1] + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[hypothesis.length];
}

/**
 * Split into characters by CODE POINT, not by UTF-16 unit. `"…".length` is
 * 1 but an emoji or an astral-plane character is 2, and indexing by unit
 * would split a surrogate pair into two "characters" that can never match
 * anything -- a guaranteed error against text that is actually correct.
 */
export function toCharacters(value: string): string[] {
  return Array.from(value);
}

export function toWords(value: string): string[] {
  const trimmed = value.trim();
  return trimmed === "" ? [] : trimmed.split(/\s+/);
}

export type ErrorRate = {
  /** edits / reference length, clamped at 0 below but NOT above: a
   *  hypothesis longer than the reference can legitimately exceed 1.0, and
   *  hiding that behind a clamp would make a catastrophic result look like
   *  a merely bad one. */
  rate: number;
  edits: number;
  referenceLength: number;
  hypothesisLength: number;
};

function rateFrom(edits: number, referenceLength: number, hypothesisLength: number): ErrorRate {
  // An empty reference is a corpus bug, not a perfect score: the schema
  // requires non-empty text, so this only guards direct callers.
  const rate = referenceLength === 0 ? (hypothesisLength === 0 ? 0 : 1) : edits / referenceLength;
  return { rate, edits, referenceLength, hypothesisLength };
}

export function characterErrorRate(reference: string, hypothesis: string, options: NormalizeOptions = {}): ErrorRate {
  const ref = toCharacters(normalizeText(reference, options));
  const hyp = toCharacters(normalizeText(hypothesis, options));
  return rateFrom(levenshtein(ref, hyp), ref.length, hyp.length);
}

export function wordErrorRate(reference: string, hypothesis: string, options: NormalizeOptions = {}): ErrorRate {
  const ref = toWords(normalizeText(reference, options));
  const hyp = toWords(normalizeText(hypothesis, options));
  return rateFrom(levenshtein(ref, hyp), ref.length, hyp.length);
}

/**
 * Corpus-level aggregate. Weighted by reference length, NOT the mean of
 * per-fixture rates: an unweighted mean lets a two-word fixture that scored
 * 1.0 outweigh a thousand-character page that scored 0.01, which is not
 * what "how wrong is this class" means.
 */
export function aggregateErrorRate(rates: readonly ErrorRate[]): ErrorRate {
  const edits = rates.reduce((sum, r) => sum + r.edits, 0);
  const referenceLength = rates.reduce((sum, r) => sum + r.referenceLength, 0);
  const hypothesisLength = rates.reduce((sum, r) => sum + r.hypothesisLength, 0);
  return rateFrom(edits, referenceLength, hypothesisLength);
}
