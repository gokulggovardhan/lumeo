import {
  createWorkspaceDocument,
  type WorkspaceArea,
  type WorkspaceDocument,
} from "./model.ts";
import {
  createDocumentSession,
  type DocumentSession,
} from "./session.ts";

export type FreshPdfContinuationKind =
  | "merge"
  | "split"
  | "crop"
  | "jpg-to-pdf"
  | "word-to-pdf"
  | "html-to-pdf";

export type FreshPdfContinuation = {
  document: WorkspaceDocument;
  session: DocumentSession;
};

function nonce(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

/**
 * Starts a fresh Workspace identity for a standalone tool result.
 *
 * Merge, split/extract and format-conversion outputs are new documents, not
 * revisions of the input PDF. They therefore begin with empty Workspace
 * history so Undo can never cross the document-identity boundary.
 */
export function createFreshPdfContinuation({
  kind,
  fileName,
  byteLength,
  pageCount,
  initialArea = "pages",
}: {
  kind: FreshPdfContinuationKind;
  fileName: string;
  byteLength: number;
  pageCount: number;
  initialArea?: WorkspaceArea;
}): FreshPdfContinuation {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError("Fresh PDF continuation requires at least one page.");
  }
  if (!Number.isFinite(byteLength) || byteLength < 1) {
    throw new RangeError("Fresh PDF continuation requires non-empty PDF bytes.");
  }

  const documentId = `standalone:${kind}:${nonce()}`;
  const document = createWorkspaceDocument(documentId, {
    id: `${documentId}:source`,
    name: fileName,
    byteLength,
    pageCount,
  });

  return {
    document,
    session: createDocumentSession({
      id: `session:${documentId}`,
      document,
      initialArea,
    }),
  };
}
