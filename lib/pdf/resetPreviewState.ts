// lib/pdf/resetPreviewState.ts
//
// Shared cleanup for the "single pdfjs document + one rendered page preview
// + one download blob" shape used by Watermark, Crop, Page Numbers, and
// Header & Footer's tool components. Each of those files had this exact
// same three-part cleanup (revoke both object URLs, destroy the live pdfjs
// document, reset the render-ready counter) duplicated verbatim in both
// their unmount effect and their "Start new" reset handler. Extracted here
// so there's one implementation instead of four.
//
// Deliberately NOT extended to Edit PDF or Organize PDF's reset -- those
// two have a genuinely different shape (Edit adds stageRef/pagePointSize,
// Organize uses a thumbnailUrlsRef Map for many pages instead of one
// pageImageUrlRef), and forcing them through this same signature would be
// exactly the kind of unnecessary abstraction that creates more coupling
// than it removes duplication.

import type { PDFDocumentProxy } from "pdfjs-dist";

type DestroyablePdfJsDocument = PDFDocumentProxy & { destroy?: () => Promise<void> | void };

export function resetPdfPreviewState({
  pageImageUrlRef,
  downloadUrlRef,
  pdfJsDocRef,
  setDocReady,
}: {
  pageImageUrlRef: React.MutableRefObject<string>;
  downloadUrlRef: React.MutableRefObject<string>;
  pdfJsDocRef: React.MutableRefObject<PDFDocumentProxy | null>;
  setDocReady: (updater: (current: number) => number) => void;
}): void {
  if (pageImageUrlRef.current) URL.revokeObjectURL(pageImageUrlRef.current);
  if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
  pageImageUrlRef.current = "";
  downloadUrlRef.current = "";
  void (pdfJsDocRef.current as DestroyablePdfJsDocument | null)?.destroy?.();
  pdfJsDocRef.current = null;
  setDocReady(() => 0);
}
