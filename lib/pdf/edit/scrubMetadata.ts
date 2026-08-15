// lib/pdf/edit/scrubMetadata.ts
//
// Removes document-level identifying metadata: the Info dictionary fields
// and the XMP packet.
//
// Both matter and they are separate places. pdf-lib's setAuthor("") and
// friends write the /Info dictionary, which is what most viewers show --
// but a PDF written by Word or InDesign ALSO carries an XMP metadata
// stream, which usually repeats the author and often adds more (the
// original filename, the editing history, the creator tool's own
// identifiers). Clearing only /Info leaves all of that in the file, findable
// with any text editor. That gap is the reason this is its own module with
// its own test rather than three setter calls at a call site.

import { PDFDocument, PDFName } from "pdf-lib";

export type ScrubResult = { clearedInfoFields: string[]; removedXmp: boolean };

const INFO_SETTERS = [
  ["Title", (doc: PDFDocument) => doc.setTitle("")],
  ["Author", (doc: PDFDocument) => doc.setAuthor("")],
  ["Subject", (doc: PDFDocument) => doc.setSubject("")],
  ["Keywords", (doc: PDFDocument) => doc.setKeywords([])],
  ["Producer", (doc: PDFDocument) => doc.setProducer("")],
  ["Creator", (doc: PDFDocument) => doc.setCreator("")],
] as const;

/**
 * Scrubs in place. Returns what was actually cleared so the UI can report
 * it rather than assert it -- "metadata removed" with nothing removed is
 * the kind of claim that gets believed.
 *
 * Dates are deliberately NOT zeroed: a PDF with no ModDate is unusual
 * enough to be its own signal, and the creation date is rarely the thing
 * being protected. Callers who need them gone should say so explicitly.
 */
export function scrubDocumentMetadata(doc: PDFDocument): ScrubResult {
  const cleared: string[] = [];

  for (const [name, apply] of INFO_SETTERS) {
    try {
      apply(doc);
      cleared.push(name);
    } catch {
      // A malformed Info entry must not abort the rest of the scrub: the
      // fields that CAN be cleared still should be.
    }
  }

  // The XMP packet hangs off the catalog as /Metadata. Removing the
  // reference is what takes it out of the document graph; pdf-lib's full
  // rewrite on save is then what keeps the orphaned stream out of the
  // output. This module is therefore only sound for a full save, never an
  // incremental update -- see redaction.ts's header.
  const catalog = doc.catalog;
  const hadXmp = catalog.get(PDFName.of("Metadata")) !== undefined;
  if (hadXmp) catalog.delete(PDFName.of("Metadata"));

  return { clearedInfoFields: cleared, removedXmp: hadXmp };
}
