// lib/pdf/edit/redaction.ts
//
// Redaction: remove text from the file, not just from view.
//
// ── What this guarantees, and what it does not ──────────────────────────
//
// GUARANTEED: characters covered by a redaction are removed from the
// content stream's text-showing operators, so they are gone from the text
// layer -- not extractable by copy/paste, Ctrl+F, pdfjs, pdftotext, or any
// parser reading the same operators. This is the same byte-level operator
// rewriting proven in PR #242, applied with an empty replacement.
//
// NOT GUARANTEED, and the caller MUST NOT claim otherwise:
//
//   • IMAGES. A scanned page is a picture of text. Nothing here touches
//     image XObjects, so a black rectangle over a scan is a rectangle over
//     a picture -- the pixels underneath are still in the file. Detecting
//     which image intersects a box needs full CTM tracking through nested
//     Form XObjects, and DELETING it needs certainty that no other page
//     shares it. Neither is implemented. `assessRedactionCoverage` reports
//     this so the UI can say so plainly.
//
//   • VECTOR ARTWORK. Path-drawing operators are not analysed. A signature
//     drawn as a path, or a barcode, survives underneath the mask.
//
//   • ANNOTATIONS, form field values, embedded files, and attachments are
//     not scrubbed by this module.
//
//   • REVISION HISTORY. A PDF saved incrementally can retain earlier
//     versions of an object. Callers must save a redacted document
//     fully-rewritten (pdf-lib's default save does this) and must not
//     produce it by incremental update.
//
// Over-redaction is the safe failure direction and is chosen deliberately
// wherever the geometry is ambiguous: a box that clips a run redacts the
// whole run rather than guessing which glyphs were inside it.

/** A rectangle in percent space (0-100), matching detected-run geometry. */
export type RedactionBox = { xPct: number; yPct: number; widthPct: number; heightPct: number };

export type SensitiveKind = "ssn" | "email" | "phone" | "credit-card" | "iban";

export type SensitiveMatch = {
  kind: SensitiveKind;
  value: string;
  /** Character offsets into the string that was scanned. */
  start: number;
  end: number;
};

// Ordered most-specific first: a US SSN and a phone number can both match a
// 9-11 digit run, and whichever is applied first wins its span. Detection is
// an AID, never the guarantee -- the UI must present matches for review, not
// redact silently on their say-so. A regex that misses one SSN in a document
// someone believed was scrubbed is exactly the harm this feature must not
// cause, so the honest framing is "found these, check for more".
const PATTERNS: { kind: SensitiveKind; pattern: RegExp }[] = [
  // Standard textual email. Deliberately not RFC-5322-complete: the long
  // tail of legal addresses is not worth the false positives.
  { kind: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // IBAN: two country letters, two check digits, then 11-30 alphanumerics.
  { kind: "iban", pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g },
  // US SSN. Excludes the never-issued ranges (000/666/900-999 area, 00
  // group, 0000 serial) so "123-00-4567" does not read as an SSN.
  { kind: "ssn", pattern: /\b(?!000|666|9\d{2})\d{3}[-\s](?!00)\d{2}[-\s](?!0000)\d{4}\b/g },
  // 13-19 digits with optional space/hyphen grouping. Luhn-checked below,
  // which is what keeps invoice numbers and order references out.
  { kind: "credit-card", pattern: /\b(?:\d[ -]?){12,18}\d\b/g },
  // Phone: permissive on separators, anchored on a plausible length.
  { kind: "phone", pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b/g },
];

/**
 * Luhn check. Without it the card pattern matches any long digit run --
 * invoice numbers, part numbers, tracking references -- and a detector that
 * cries wolf trains people to skim past the review step, which is worse
 * than one that finds less.
 */
export function passesLuhn(digits: string): boolean {
  const clean = digits.replace(/\D/g, "");
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let digit = clean.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Finds candidate sensitive values. Overlapping matches are resolved in
 * favour of the earlier, more specific pattern -- one span is never claimed
 * by two kinds, because the caller redacts by offset and overlapping spans
 * would corrupt the offsets.
 */
export function findSensitiveMatches(text: string): SensitiveMatch[] {
  const claimed: SensitiveMatch[] = [];

  for (const { kind, pattern } of PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }
      if (kind === "credit-card" && !passesLuhn(match[0])) continue;
      const overlaps = claimed.some((existing) => start < existing.end && end > existing.start);
      if (overlaps) continue;
      claimed.push({ kind, value: match[0], start, end });
    }
  }

  return claimed.sort((a, b) => a.start - b.start);
}

/**
 * Removes the matched spans from a string, leaving everything else intact.
 * Used as the replacement text for a partially-redacted run, so redacting
 * an SSN out of "Employee SSN 123-45-6789 on file" keeps the sentence and
 * loses only the number.
 *
 * Matches must not overlap (findSensitiveMatches guarantees it); applied
 * back-to-front so earlier offsets stay valid as the string shortens.
 */
export function removeSpans(text: string, spans: readonly { start: number; end: number }[]): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const span of ordered) {
    if (span.start < 0 || span.end > out.length || span.end < span.start) continue;
    out = out.slice(0, span.start) + out.slice(span.end);
  }
  return out;
}

/** Percent-space rectangle overlap. Touching edges do not count. */
export function boxesOverlap(a: RedactionBox, b: RedactionBox): boolean {
  return (
    a.xPct < b.xPct + b.widthPct &&
    a.xPct + a.widthPct > b.xPct &&
    a.yPct < b.yPct + b.heightPct &&
    a.yPct + a.heightPct > b.yPct
  );
}

export type RedactableRun = RedactionBox & { str: string };

/**
 * Which runs a set of boxes touches. A run the box merely clips is included
 * WHOLE: run geometry is a single rectangle with no per-glyph positions, so
 * there is no honest way to decide that only some characters were inside.
 * Redacting the whole run over-removes; the alternative under-removes, and
 * under-removal is the one that leaks.
 */
export function runsIntersectingBoxes<T extends RedactableRun>(runs: readonly T[], boxes: readonly RedactionBox[]): T[] {
  return runs.filter((run) => boxes.some((box) => boxesOverlap(run, box)));
}

/**
 * The union of a run's own box and the boxes covering it, so the black mask
 * drawn afterwards certainly covers what was removed -- a mask sized to the
 * user's drag alone can leave a sliver of the original glyphs' anti-aliased
 * edges showing if the run extends past it.
 */
export function maskBoxFor(run: RedactionBox, boxes: readonly RedactionBox[], padPct = 0.35): RedactionBox {
  const covering = boxes.filter((box) => boxesOverlap(run, box));
  const left = Math.min(run.xPct, ...covering.map((b) => b.xPct));
  const top = Math.min(run.yPct, ...covering.map((b) => b.yPct));
  const right = Math.max(run.xPct + run.widthPct, ...covering.map((b) => b.xPct + b.widthPct));
  const bottom = Math.max(run.yPct + run.heightPct, ...covering.map((b) => b.yPct + b.heightPct));
  return {
    xPct: Math.max(0, left - padPct),
    yPct: Math.max(0, top - padPct),
    widthPct: Math.min(100, right + padPct) - Math.max(0, left - padPct),
    heightPct: Math.min(100, bottom + padPct) - Math.max(0, top - padPct),
  };
}

export type CoverageWarning =
  | { kind: "run-not-matched"; text: string }
  | { kind: "run-spans-operators"; text: string }
  | { kind: "page-has-images" };

/**
 * What the caller must tell the user BEFORE they trust the output.
 *
 * A redaction that silently failed on one run is worse than one that
 * refused outright, because the file looks redacted. Every run that could
 * not be stripped is named here so the UI can list it, and the presence of
 * any image on the page is reported because a black box over a scan is
 * cosmetic only.
 */
export function assessRedactionCoverage(input: {
  targetedRuns: readonly { str: string }[];
  strippedRuns: readonly { str: string }[];
  unmatchedRuns: readonly { str: string }[];
  multiOperatorRuns: readonly { str: string }[];
  pageHasImages: boolean;
}): { complete: boolean; warnings: CoverageWarning[] } {
  const warnings: CoverageWarning[] = [
    ...input.unmatchedRuns.map((run) => ({ kind: "run-not-matched" as const, text: run.str })),
    ...input.multiOperatorRuns.map((run) => ({ kind: "run-spans-operators" as const, text: run.str })),
  ];
  if (input.pageHasImages) warnings.push({ kind: "page-has-images" });

  const everyTargetStripped = input.strippedRuns.length === input.targetedRuns.length;
  return { complete: everyTargetStripped && warnings.length === 0, warnings };
}

export function describeCoverageWarning(warning: CoverageWarning): string {
  switch (warning.kind) {
    case "run-not-matched":
      return `“${warning.text}” could not be located in the page's content stream, so it was masked but NOT removed.`;
    case "run-spans-operators":
      return `“${warning.text}” is split across several operators; it was masked but NOT removed.`;
    case "page-has-images":
      return "This page contains an image. Text inside an image is part of the picture and is not removed by redaction.";
  }
}
