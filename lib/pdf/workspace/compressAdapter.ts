import {
  createWorkspaceDocument,
  type WorkspaceDocument,
} from "./model.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
  setWorkspaceArea,
  type DocumentSession,
} from "./session.ts";

export type CompressWorkspaceDetails = {
  mode: "quality" | "target";
  profile?: string;
  originalBytes: number;
  outputBytes: number;
};

export function createCompressWorkspaceSession({
  document,
  baseSession,
  details,
}: {
  document: WorkspaceDocument;
  baseSession?: DocumentSession | null;
  details: CompressWorkspaceDetails;
}): DocumentSession {
  const seeded =
    baseSession && baseSession.state.document.id === document.id
      ? setWorkspaceArea(baseSession, "optimize")
      : createDocumentSession({
          id: `compress:${document.id}`,
          document,
          initialArea: "optimize",
        });

  return recordWorkspaceOperation(seeded, {
    id: `compress:${seeded.history.cursor + 1}`,
    type: "optimize.compress",
    area: "optimize",
    description: "PDF compressed",
    scope: { kind: "document" },
    parameters: {
      mode: details.mode,
      profile: details.profile ?? null,
      originalBytes: details.originalBytes,
      outputBytes: details.outputBytes,
    },
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: true, version: 1 },
  });
}

export function createStandaloneCompressWorkspaceDocument({
  fileName,
  byteLength,
  pageCount,
}: {
  fileName: string;
  byteLength: number;
  pageCount: number;
}): WorkspaceDocument {
  const nonce =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const documentId = `compress:${nonce}`;
  return createWorkspaceDocument(documentId, {
    id: `${documentId}:source`,
    name: fileName,
    byteLength,
    pageCount,
  });
}
