// lib/pdf/edit/applyRedaction.ts
//
// The redaction pipeline, in one place so the UI and the tests exercise the
// SAME code. A test that reimplements the pipeline proves the test's copy
// works, which is exactly the wrong thing to learn about a security
// feature.
//
// Read lib/pdf/edit/redaction.ts's header first: it states what redaction
// does and does not guarantee, and this module inherits every one of those
// limits.

import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { buildEditPlan } from "./editPlan.ts";
import { applyEditPlanToDocument } from "./applyEditPlan.ts";
import { resolveFont } from "./fontEncoding.ts";
import { resolveFontMetrics } from "./fontMetrics.ts";
import { collectPageTextOperators } from "./formXObjects.ts";
import { buildOperatorSpatialIndex, matchDetectedRunToOperatorIndexed, runSpansMultipleOperators } from "./matchTextRun.ts";
import { scrubDocumentMetadata } from "./scrubMetadata.ts";
import { assessRedactionCoverage, type CoverageWarning } from "./redaction.ts";
import type { DetectedTextRun } from "./textRuns.ts";

/**
 * A detected run plus what should survive it. Extends DetectedTextRun
 * rather than restating its geometry: the spatial matcher keys off the
 * font name and size as well as the box, so a structurally-similar type
 * with only the rectangle would match the wrong operator on a page where
 * two runs overlap.
 */
export type RedactionTargetRun = DetectedTextRun & {
  /** What should remain of this run. "" removes it entirely. */
  replacementText: string;
};

export type RedactionOutcome = {
  bytes: ArrayBuffer;
  strippedRuns: string[];
  /** Targeted but NOT removed. These were masked only -- the UI must say so. */
  unremovedRuns: string[];
  warnings: CoverageWarning[];
  complete: boolean;
  metadataScrubbed: boolean;
};

/**
 * True when the page draws any image or form XObject. Text inside one is
 * pixels, not operators, so nothing in this module can remove it -- the
 * caller has to tell the user that a black box over it is cosmetic.
 *
 * Deliberately coarse: it reports the PRESENCE of an image anywhere on the
 * page rather than whether one sits under a particular box, because
 * deciding the latter needs CTM tracking through nested forms. Over-warning
 * is the safe direction; a missed warning is a false assurance.
 */
export function pageDrawsImages(doc: PDFDocument, pageIndex: number): boolean {
  const page = doc.getPage(pageIndex);
  const resources = page.node.Resources();
  const xobjects = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xobjects !== undefined && xobjects.keys().length > 0;
}

/**
 * Strips every targeted run's redacted characters from `source`, scrubs
 * document metadata, and reports precisely what it could not remove.
 *
 * Runs it cannot strip are NOT an error: the caller still draws a mask over
 * them, and they come back in `unremovedRuns` so the UI can name them. The
 * alternative -- failing the whole operation because one run was awkward --
 * would push people toward covering things with a black rectangle by hand,
 * which is strictly worse.
 */
export async function applyRedaction(
  source: ArrayBuffer,
  pageIndex: number,
  targets: readonly RedactionTargetRun[],
  viewport: { width: number; height: number; transform: number[] },
  options: { scrubMetadata?: boolean } = {},
): Promise<RedactionOutcome> {
  const doc = await PDFDocument.load(source.slice(0));
  const located = collectPageTextOperators(doc, pageIndex);
  const index = buildOperatorSpatialIndex(located.map((entry) => entry.operator), viewport.transform);

  const strippedRuns: string[] = [];
  const unmatchedRuns: { str: string }[] = [];
  const multiOperatorRuns: { str: string }[] = [];

  for (const target of targets) {
    const operator = matchDetectedRunToOperatorIndexed(target, viewport.width, viewport.height, index);
    if (!operator) {
      unmatchedRuns.push({ str: target.str });
      continue;
    }

    const locatedOperator = located.find((entry) => entry.operator === operator);
    if (!locatedOperator) {
      unmatchedRuns.push({ str: target.str });
      continue;
    }

    try {
      const fontDict = locatedOperator.resources
        .lookup(PDFName.of("Font"), PDFDict)
        .lookup(PDFName.of(operator.fontResourceName!), PDFDict);
      const resolvedFont = resolveFont(fontDict, doc.context);
      const plan = buildEditPlan({
        pageIndex,
        contentStreamIndex: locatedOperator.locator.kind === "page" ? locatedOperator.locator.contentStreamIndex : 0,
        formPath: locatedOperator.locator.kind === "xobject" ? locatedOperator.locator.formPath : null,
        operatorIndex: locatedOperator.operatorIndex,
        operator,
        replacementText: target.replacementText,
        resolvedFont,
        fontMetrics: resolveFontMetrics(fontDict, doc.context, resolvedFont),
      });

      // The multi-operator check needs the plan: only it carries the
      // operator's decoded text, which is what says whether ONE operator
      // covers the whole visual run. Checking earlier compares against
      // nothing and rejects everything.
      if (runSpansMultipleOperators(plan.originalText, target.str)) {
        multiOperatorRuns.push({ str: target.str });
        continue;
      }
      if (!plan.editable) {
        unmatchedRuns.push({ str: target.str });
        continue;
      }

      await applyEditPlanToDocument(doc, plan, resolvedFont.bytesPerCode, {
        isolate: locatedOperator.locator.kind === "xobject",
      });
      strippedRuns.push(target.str);
    } catch {
      // A run that throws is a run that was not removed. Recording it is
      // the whole point -- swallowing it silently is how a file ends up
      // looking redacted while carrying the data.
      unmatchedRuns.push({ str: target.str });
    }
  }

  const metadataScrubbed = options.scrubMetadata !== false;
  if (metadataScrubbed) scrubDocumentMetadata(doc);

  const { complete, warnings } = assessRedactionCoverage({
    targetedRuns: targets.map((target) => ({ str: target.str })),
    strippedRuns: strippedRuns.map((str) => ({ str })),
    unmatchedRuns,
    multiOperatorRuns,
    pageHasImages: pageDrawsImages(doc, pageIndex),
  });

  const saved = await doc.save();
  return {
    bytes: saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer,
    strippedRuns,
    unremovedRuns: [...unmatchedRuns, ...multiOperatorRuns].map((run) => run.str),
    warnings,
    complete,
    metadataScrubbed,
  };
}
