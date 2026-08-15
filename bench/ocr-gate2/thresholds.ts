// bench/ocr-gate2/thresholds.ts
//
// PROPOSED Gate 2 targets. Not ratified -- the OCR evaluation spec
// deliberately left the numbers blank, because picking a threshold before
// seeing any measurement is inventing it. These are a starting position for
// that decision, derived from what each class is FOR rather than from what
// the current configuration happens to score:
//
//   class-a-clean   a printed page scanned properly. If OCR cannot read
//                   this near-perfectly there is no product, so the bar is
//                   strict.
//   class-b-skewed  the same page fed in crooked. Common enough that it
//                   must work; a modest penalty for skew is acceptable.
//   class-c-photos  a phone snap. Genuinely hard. The honest options are a
//                   loose bar or a refusal, and the codebase's existing
//                   preference (see the edit engine's un-editable cases) is
//                   to refuse with a reason rather than emit text the user
//                   cannot trust.
//
// A class that misses its target is not automatically a failure of OCR --
// it is the signal to decide between improving preprocessing (deskew,
// binarisation) and gating on Tesseract's own confidence.

import type { CorpusClass } from "./groundTruth.ts";

export type ClassThreshold = { cer: number; wer: number };

export const PROPOSED_THRESHOLDS: Record<CorpusClass, ClassThreshold> = {
  "class-a-clean": { cer: 0.02, wer: 0.05 },
  "class-b-skewed": { cer: 0.05, wer: 0.12 },
  "class-c-photos": { cer: 0.15, wer: 0.3 },
};
