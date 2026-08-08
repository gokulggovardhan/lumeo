// lib/pdf/edit/matchTextRun.ts
//
// Phase 2 of true PDF text editing, slice 1 (continued): pairs a
// Phase-1-detected text run (lib/pdf/edit/textRuns.ts, derived from
// pdfjs's page.getTextContent()) with the specific content-stream
// text-show operator that produced it (lib/pdf/edit/contentStream.ts,
// derived from parsing the page's actual operator bytes).
//
// Both sides describe the exact same real PDF text run, computed from the
// same underlying Tf/Tm/CTM state, through two independent code paths --
// pdfjs's own text extraction, and this project's own content-stream
// walker. Matching them by position (converting the operator's own
// text-rendering matrix through the identical box-origin math
// textRunsFromContent uses, via boxOriginFromTransform, so both sides are
// computed the same way) is far more robust than matching by decoded
// string content, since a run's glyph codes may not equal its visible
// characters at all for a custom-encoded or subsetted font -- decoding
// that is a separate, later problem this slice deliberately doesn't solve.
//
// Self-contained (no project-file imports) so this can run directly under
// `node --experimental-strip-types` for tests, matching every other
// lib/pdf/edit/*.ts module's convention.

import { boxOriginFromTransform, transformPoint2x3, type DetectedTextRun } from "./textRuns.ts";
import type { TextShowOperator } from "./contentStream.ts";

// How close (in device pixels, at whatever viewport scale the caller used
// for both textRunsFromContent and this match) an operator's own computed
// position must be to a detected run's box origin to count as the same
// run. Loose enough to absorb floating-point drift between the two
// independent computations, tight enough that two distinct runs on the
// same line practically never collide -- a typical minimum font size
// (~6-8px) is already larger than this.
const POSITION_TOLERANCE_PX = 1.5;

export type MatchedTextRun = {
  run: DetectedTextRun;
  operator: TextShowOperator;
};

// Converts one content-stream text-show operator's own rendering matrix
// into the same left/top device-pixel origin a pdfjs-derived DetectedTextRun
// would have, so it can be compared directly against one.
function operatorOriginPx(operator: TextShowOperator, viewportTransform: number[]) {
  const tx = transformPoint2x3(viewportTransform, operator.textRenderingMatrix);
  return boxOriginFromTransform(tx);
}

// Finds the content-stream operator whose own computed position is closest
// to a detected run's box origin, within POSITION_TOLERANCE_PX. Returns
// null if no operator is close enough -- this is a real, expected outcome
// (not an error): the run may be on a page/text-object shape this slice's
// walker doesn't yet cover (e.g. a Type3 font's own glyph-drawing content
// stream, or text inside a form XObject), and callers must treat "no
// match" as "in-place editing isn't available for this run yet," never
// guess a nearby operator instead.
// Shared by both the brute-force matchDetectedRunToOperator below and the
// spatial-index path (matchDetectedRunToOperatorIndexed) -- the only
// difference between them is how many candidates get passed in here, never
// the matching math itself, so there is exactly one place that decides
// what "closest" and "close enough" mean.
function bestOperatorAmong(
  operators: TextShowOperator[],
  targetLeftPx: number,
  targetTopPx: number,
  viewportTransform: number[],
): TextShowOperator | null {
  let best: TextShowOperator | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const operator of operators) {
    const origin = operatorOriginPx(operator, viewportTransform);
    const distance = Math.hypot(origin.left - targetLeftPx, origin.top - targetTopPx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = operator;
    }
  }

  return best && bestDistance <= POSITION_TOLERANCE_PX ? best : null;
}

export function matchDetectedRunToOperator(
  run: DetectedTextRun,
  pageWidthPx: number,
  pageHeightPx: number,
  operators: TextShowOperator[],
  viewportTransform: number[],
): TextShowOperator | null {
  const targetLeftPx = (run.xPct / 100) * pageWidthPx;
  const targetTopPx = (run.yPct / 100) * pageHeightPx;
  return bestOperatorAmong(operators, targetLeftPx, targetTopPx, viewportTransform);
}

// Phase 24: EditPdfTool matches EVERY detected run against EVERY operator
// (O(runs x operators), see matchDetectedRunToOperator above) once per page
// -- fine for an ordinary page, but a genuinely dense one (500+ runs and a
// similar operator count) can reach hundreds of thousands of
// transformPoint2x3+hypot calls per page view. Only operators within
// POSITION_TOLERANCE_PX of a run can ever actually be chosen (see
// bestOperatorAmong's own tolerance check) -- everything farther away is
// wasted work. A uniform spatial grid, built once per page and reused for
// every run's lookup, exploits that: bucket every operator's own origin by
// its cell, then for a given run only scan the 3x3 neighborhood of cells
// around its target position.
//
// Correctness: INDEX_CELL_PX is chosen as 2x POSITION_TOLERANCE_PX
// specifically so that neighborhood is PROVABLY sufficient, not just
// "probably fine" -- if two points' cell indices (floor(coord/cellSize))
// differ by 2 or more along either axis, the points themselves are more
// than cellSize apart along that axis (a direct consequence of how floor
// division buckets a number line), which here is more than
// 2*POSITION_TOLERANCE_PX >= POSITION_TOLERANCE_PX. So any operator within
// tolerance of a run's target position is guaranteed to share the run's
// cell or one immediately adjacent to it -- the 3x3 scan can never miss a
// real match, and matchDetectedRunToOperatorIndexed returns EXACTLY what
// matchDetectedRunToOperator would for the same inputs, just without
// scoring operators that were never going to be picked anyway.
const INDEX_CELL_PX = POSITION_TOLERANCE_PX * 2;

export type OperatorSpatialIndex = {
  buckets: Map<string, TextShowOperator[]>;
  viewportTransform: number[];
};

function cellKey(leftPx: number, topPx: number): string {
  return `${Math.floor(leftPx / INDEX_CELL_PX)},${Math.floor(topPx / INDEX_CELL_PX)}`;
}

// Builds the index once per page (see EditPdfTool.tsx's operator-matching
// effect) -- O(operators), the same one-time cost matchDetectedRunToOperator
// already pays per-run today, just paid once instead of once-per-run.
export function buildOperatorSpatialIndex(operators: TextShowOperator[], viewportTransform: number[]): OperatorSpatialIndex {
  const buckets = new Map<string, TextShowOperator[]>();
  for (const operator of operators) {
    const origin = operatorOriginPx(operator, viewportTransform);
    const key = cellKey(origin.left, origin.top);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(operator);
    else buckets.set(key, [operator]);
  }
  return { buckets, viewportTransform };
}

export function matchDetectedRunToOperatorIndexed(
  run: DetectedTextRun,
  pageWidthPx: number,
  pageHeightPx: number,
  index: OperatorSpatialIndex,
): TextShowOperator | null {
  const targetLeftPx = (run.xPct / 100) * pageWidthPx;
  const targetTopPx = (run.yPct / 100) * pageHeightPx;
  const cellX = Math.floor(targetLeftPx / INDEX_CELL_PX);
  const cellY = Math.floor(targetTopPx / INDEX_CELL_PX);

  const candidates: TextShowOperator[] = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = index.buckets.get(`${cellX + dx},${cellY + dy}`);
      if (bucket) candidates.push(...bucket);
    }
  }

  return bestOperatorAmong(candidates, targetLeftPx, targetTopPx, index.viewportTransform);
}

// Phase 9.2 UI regression: pdfjs's getTextContent() can merge several
// consecutive content-stream operators (e.g. two back-to-back Tj calls with
// no positioning gap) into ONE visual DetectedTextRun -- but
// matchDetectedRunToOperator, by design, only ever matches that run to a
// SINGLE operator (usually the first). Editing via that one operator alone
// would silently rewrite only part of the visual run, leaving the other
// operators' original text sitting directly against the replacement (e.g.
// replacing a merged "Hello World" run with "Goodbye" actually produced
// "GoodbyeWorld"). Compares the matched operator's own original text
// (already decoded through the font's real encoding, e.g.
// lib/pdf/edit/editPlan.ts's EditPlan.originalText) against the full
// detected run's raw string -- a mismatch means the run spans more than one
// operator, and in-place editing must be rejected rather than silently
// applied to only part of it.
export function runSpansMultipleOperators(matchedOperatorText: string, fullDetectedRunText: string): boolean {
  return matchedOperatorText !== fullDetectedRunText;
}
