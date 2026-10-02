import { copyArrayBuffer } from "../arrayBuffer.ts";
import {
  assertUniquePageIds,
  createWorkspaceDocument,
  type WorkspaceArea,
  type WorkspaceDocument,
  type WorkspaceSource,
} from "./model.ts";
import {
  createDocumentSession,
  setWorkspaceArea,
  type DocumentSession,
} from "./session.ts";

export type WorkspaceRuntimeOrigin = {
  fileName: string;
  byteLength: number;
  pageCount: number;
};

export type WorkspaceRuntimeRevision = {
  id: string;
  number: number;
  fileName: string;
  byteLength: number;
  pageCount: number;
  bytes: ArrayBuffer;
};

export type WorkspaceDocumentRuntime = {
  id: string;
  origin: WorkspaceRuntimeOrigin;
  revision: WorkspaceRuntimeRevision;
  session: DocumentSession;
};

export type CreateWorkspaceRuntimeInput = {
  id: string;
  sourceId: string;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  initialArea: WorkspaceArea;
};

export type PublishWorkspaceRevisionInput = {
  expectedRevision: number;
  bytes: ArrayBuffer;
  fileName?: string;
  pageCount: number;
  area: WorkspaceArea;
  document?: WorkspaceDocument;
  session?: DocumentSession;
};

export class WorkspaceRevisionConflictError extends Error {
  constructor(
    public readonly expectedRevision: number,
    public readonly actualRevision: number,
  ) {
    super(
      `Workspace revision changed before this update completed (expected ${expectedRevision}, current ${actualRevision}).`,
    );
    this.name = "WorkspaceRevisionConflictError";
  }
}

function assertPageCount(pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new RangeError("Workspace page count must be a positive integer.");
  }
}

function assertBytes(bytes: ArrayBuffer): void {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 1) {
    throw new RangeError("Workspace document bytes must not be empty.");
  }
}

function visiblePageCount(document: WorkspaceDocument): number {
  return document.pages.filter((page) => !page.deleted).length;
}

function sourceForRuntime(input: CreateWorkspaceRuntimeInput): WorkspaceSource {
  return {
    id: input.sourceId,
    name: input.fileName,
    byteLength: input.bytes.byteLength,
    pageCount: input.pageCount,
  };
}

export function createWorkspaceRuntime(
  input: CreateWorkspaceRuntimeInput,
): WorkspaceDocumentRuntime {
  assertBytes(input.bytes);
  assertPageCount(input.pageCount);

  const document = createWorkspaceDocument(
    input.id,
    sourceForRuntime(input),
  );
  const session = createDocumentSession({
    id: `session:${input.id}`,
    document,
    initialArea: input.initialArea,
  });

  return {
    id: input.id,
    origin: {
      fileName: input.fileName,
      byteLength: input.bytes.byteLength,
      pageCount: input.pageCount,
    },
    revision: {
      id: `${input.id}:revision:0`,
      number: 0,
      fileName: input.fileName,
      byteLength: input.bytes.byteLength,
      pageCount: input.pageCount,
      bytes: copyArrayBuffer(input.bytes),
    },
    session,
  };
}

export function publishWorkspaceRevision(
  runtime: WorkspaceDocumentRuntime,
  input: PublishWorkspaceRevisionInput,
): WorkspaceDocumentRuntime {
  if (input.expectedRevision !== runtime.revision.number) {
    throw new WorkspaceRevisionConflictError(
      input.expectedRevision,
      runtime.revision.number,
    );
  }

  assertBytes(input.bytes);
  assertPageCount(input.pageCount);

  const nextDocument =
    input.document ??
    input.session?.state.document ??
    runtime.session.state.document;

  assertUniquePageIds(nextDocument.pages);

  if (visiblePageCount(nextDocument) !== input.pageCount) {
    throw new Error(
      "Workspace revision page count does not match the active document topology.",
    );
  }

  const sourceSession = input.session ?? runtime.session;
  const nextSession: DocumentSession = {
    ...sourceSession,
    state: {
      ...sourceSession.state,
      document: nextDocument,
    },
  };

  const session = setWorkspaceArea(nextSession, input.area);
  const nextRevisionNumber = runtime.revision.number + 1;
  const fileName = input.fileName ?? runtime.revision.fileName;

  return {
    ...runtime,
    revision: {
      id: `${runtime.id}:revision:${nextRevisionNumber}`,
      number: nextRevisionNumber,
      fileName,
      byteLength: input.bytes.byteLength,
      pageCount: input.pageCount,
      bytes: copyArrayBuffer(input.bytes),
    },
    session,
  };
}

export function updateWorkspaceRuntimeSession(
  runtime: WorkspaceDocumentRuntime,
  session: DocumentSession,
): WorkspaceDocumentRuntime {
  if (session.state.document.id !== runtime.session.state.document.id) {
    throw new Error("Workspace session belongs to a different document.");
  }

  assertUniquePageIds(session.state.document.pages);
  return { ...runtime, session };
}

export function workspaceRuntimeBytes(
  runtime: WorkspaceDocumentRuntime,
): ArrayBuffer {
  return copyArrayBuffer(runtime.revision.bytes);
}

export function workspaceRuntimeHasChanges(
  runtime: WorkspaceDocumentRuntime,
): boolean {
  return (
    runtime.revision.number > 0 ||
    runtime.session.state.hasUnsavedChanges
  );
}
