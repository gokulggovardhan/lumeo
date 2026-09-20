// lib/pdf/edit/browserEngine.ts
//
// One browser-side module boundary for the in-place Edit PDF engine.
//
// The edit engine passes pdf-lib object instances (PDFDocument, PDFDict,
// PDFRef, PDFRawStream, etc.) across several helpers that intentionally use
// instanceof checks. Loading those helpers as independent dynamic entrypoints
// lets a bundler split the pdf-lib dependency graph independently. A single
// facade keeps creation and inspection of pdf-lib objects inside one shared
// browser module graph while still preserving lazy loading for /pdf/edit.

import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { exportEditedPdf } from "./export";
import { collectPageTextOperators } from "./formXObjects";
import { resolveFont } from "./fontEncoding";
import { resolveFontMetrics } from "./fontMetrics";
import {
  applyEditPlanToDocument,
  applyMultiRunEditPlanToDocument,
} from "./applyEditPlan";
import { readFallbackStyleHints } from "./fallbackFont";

export {
  PDFDocument,
  PDFName,
  PDFDict,
  exportEditedPdf,
  collectPageTextOperators,
  resolveFont,
  resolveFontMetrics,
  applyEditPlanToDocument,
  applyMultiRunEditPlanToDocument,
  readFallbackStyleHints,
};
