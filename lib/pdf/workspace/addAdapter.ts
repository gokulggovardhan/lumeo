import type { WorkspaceDocument } from "./model.ts";
import {
  createDocumentSession,
  recordWorkspaceOperation,
  setWorkspaceArea,
  type DocumentSession,
} from "./session.ts";

export type AddWorkspaceOperationKind =
  | "watermark"
  | "page-numbers"
  | "header-footer";

const DESCRIPTION: Record<AddWorkspaceOperationKind, string> = {
  watermark: "Watermark added",
  "page-numbers": "Page numbers added",
  "header-footer": "Header and footer added",
};

export function createAddWorkspaceSession({
  document,
  baseSession,
  kind,
}: {
  document: WorkspaceDocument;
  baseSession?: DocumentSession | null;
  kind: AddWorkspaceOperationKind;
}): DocumentSession {
  const seeded =
    baseSession && baseSession.state.document.id === document.id
      ? setWorkspaceArea(baseSession, "enhance")
      : createDocumentSession({
          id: `add:${document.id}`,
          document,
          initialArea: "enhance",
        });

  const operationId = `add:${kind}:${seeded.history.cursor + 1}`;
  if (
    seeded.history.operations
      .slice(0, seeded.history.cursor)
      .some((operation) => operation.id === operationId)
  ) {
    return seeded;
  }

  return recordWorkspaceOperation(seeded, {
    id: operationId,
    type: `add.${kind}`,
    area: "enhance",
    description: DESCRIPTION[kind],
    scope: { kind: "document" },
    parameters: { kind },
    undoable: true,
    affectsPreview: true,
    affectsExport: true,
    flow: { eligible: false, reason: "content-specific" },
  });
}
