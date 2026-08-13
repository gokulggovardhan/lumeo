// lib/pdf/edit/restyleRun.ts
//
// Self-contained (no project-file imports), matching every other pure logic
// module in this directory -- see lib/pdf/edit/elements.ts's own top comment
// for why.
//
// Turns one DETECTED existing text run into the geometry for a whiteout +
// replacement-text pair, so a user can restyle text the in-place editor
// can't touch.
//
// Why this exists at all: lib/pdf/edit/editPlan.ts edits existing PDF text
// by substituting glyph codes inside the original content-stream operator.
// That preserves font, size, colour and position for free -- precisely
// because it never touches them. It therefore cannot CHANGE any of them.
// Restyling means covering the original and drawing new text over it, which
// is a fundamentally different operation with a real trade-off: full
// formatting freedom, but the original glyphs still exist underneath (hidden,
// not removed -- the same caveat the Whiteout tool already carries), and the
// replacement is a placed element rather than real document text.
//
// This module only computes geometry. It creates no elements and knows
// nothing about React state; the caller feeds the result into
// createWhiteoutElement/createTextElement so restyled text is an ordinary
// placed element from that point on (same undo/redo, same export path).

// Must match lib/pdf/edit/textRuns.ts's own DEFAULT_ASCENT_RATIO. Both
// files deliberately keep their own copy rather than importing each other
// (self-containment, see the top comment) -- if one changes, change both.
const DEFAULT_ASCENT_RATIO = 0.85;

// Grows the whiteout slightly beyond the detected run box. Detected boxes
// come from pdfjs's own text-layer math, which tracks the text's advance
// width and nominal font height -- not the true ink extents, so descenders,
// overshoot on round glyphs, and antialiased edges can all bleed a pixel or
// two past it. Without the pad, restyled text shows a faint ghost outline of
// the original underneath. Expressed as a fraction of the run's own height
// so it scales with the text rather than being a fixed percentage of the
// page (which would be far too much padding on a small font, and too little
// on a heading).
const WHITEOUT_PAD_RATIO = 0.18;

export type DetectedRunGeometry = {
  str: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  /** Font size in PDF points (see lib/pdf/edit/textRuns.ts's DetectedTextRun). */
  fontSizePt: number;
};

export type RestylePlan = {
  whiteout: { xPct: number; yPct: number; widthPct: number; heightPct: number };
  text: {
    text: string;
    fontSizePt: number;
    xPct: number;
    yPct: number;
    widthPct: number;
    heightPct: number;
  };
};

function clampPct(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes where to place the whiteout and the replacement text box so the
 * restyled text lands visually on top of the run it replaces.
 *
 * Took a `pixelsPerPoint` ratio until the high-zoom work, to convert the
 * run's then-device-pixel font size into the PDF points
 * TextEditElement.fontSizePt is measured in. Detection now reports points
 * directly (see DetectedTextRun.fontSizePt), so there is nothing left to
 * convert -- and, more to the point, nothing left that could go stale when
 * the raster scale changes for zoom.
 */
export function planRunRestyle(run: DetectedRunGeometry): RestylePlan {
  const fontSizePt = run.fontSizePt;

  const padPct = run.heightPct * WHITEOUT_PAD_RATIO;

  // The replacement box sits slightly HIGHER than the detected run box.
  //
  // A detected run's yPct is the top of its nominal box, and its true
  // baseline sits at top + ascent (ascent = height * DEFAULT_ASCENT_RATIO,
  // matching how textRuns.ts derived that top in the first place).
  // lib/pdf/edit/export.ts, meanwhile, draws a placed text element's
  // baseline at its top + the full font size, not top + ascent.
  //
  // Left uncorrected those two conventions disagree by exactly
  // (1 - DEFAULT_ASCENT_RATIO) of the run's height, and the replacement
  // renders noticeably low -- most visible on a table row, where it drops
  // toward the rule beneath it. Shifting the box up by that same fraction
  // makes the two baselines coincide.
  const baselineCorrectionPct = run.heightPct * (1 - DEFAULT_ASCENT_RATIO);

  return {
    whiteout: {
      xPct: clampPct(run.xPct - padPct, 0, 100),
      yPct: clampPct(run.yPct - padPct, 0, 100),
      widthPct: clampPct(run.widthPct + padPct * 2, 0, 100 - clampPct(run.xPct - padPct, 0, 100)),
      heightPct: clampPct(run.heightPct + padPct * 2, 0, 100 - clampPct(run.yPct - padPct, 0, 100)),
    },
    text: {
      text: run.str,
      fontSizePt,
      xPct: clampPct(run.xPct, 0, 100),
      yPct: clampPct(run.yPct - baselineCorrectionPct, 0, 100),
      // Slack on both axes so the on-screen textarea doesn't wrap or clip
      // text that fit the original run exactly -- the replacement is
      // editable, so the user will often make it longer than the original.
      widthPct: clampPct(run.widthPct * 1.15, 1, 100 - run.xPct),
      heightPct: clampPct(run.heightPct * 1.6, 1, 100 - run.yPct),
    },
  };
}
