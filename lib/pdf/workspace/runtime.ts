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
  recordWorkspaceOperation,
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

export type CreateWorkspaceRuntimeFromSessionInput = {
  id: string;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  area: WorkspaceArea;
  session: DocumentSession;
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
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super(
      `Workspace revision changed before this update completed (expected ${expectedRevision}, current ${actualRevision}).`,
    );
    this.name = "WorkspaceRevisionConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
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

export function createWorkspaceRuntimeFromSession(
  input: CreateWorkspaceRuntimeFromSessionInput,
): WorkspaceDocumentRuntime {
  assertBytes(input.bytes);
  assertPageCount(input.pageCount);
  assertUniquePageIds(input.session.state.document.pages);

  if (visiblePageCount(input.session.state.document) !== input.pageCount) {
    throw new Error(
      "Workspace continuation page count does not match the active document topology.",
    );
  }

  const firstSource = input.session.state.document.sources[0];
  const session = setWorkspaceArea(input.session, input.area);

  return {
    id: input.id,
    origin: {
      fileName: firstSource?.name ?? input.fileName,
      byteLength: firstSource?.byteLength ?? input.bytes.byteLength,
      pageCount: firstSource?.pageCount ?? input.pageCount,
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

function operationIdentity(
  operation: DocumentSession["history"]["operations"][number],
): string {
  return `${operation.area}:${operation.id}`;
}

export function mergeWorkspaceSessions(
  base: DocumentSession,
  incoming: DocumentSession,
  activeArea: WorkspaceArea,
): DocumentSession {
  if (base.state.document.id !== incoming.state.document.id) {
    throw new Error("Workspace continuation belongs to a different document.");
  }

  assertUniquePageIds(incoming.state.document.pages);

  const appliedBase = base.history.operations.slice(0, base.history.cursor);
  const appliedIncoming = incoming.history.operations.slice(
    0,
    incoming.history.cursor,
  );
  const known = new Set(appliedBase.map(operationIdentity));

  let merged: DocumentSession = {
    ...base,
    history: {
      operations: appliedBase,
      cursor: appliedBase.length,
    },
    state: {
      ...base.state,
      document: incoming.state.document,
      selectedPageIds: [],
      historyCursor: appliedBase.length,
      operationCount: appliedBase.length,
    },
  };

  for (const operation of appliedIncoming) {
    const key = operationIdentity(operation);
    if (known.has(key)) continue;
    merged = recordWorkspaceOperation(merged, operation);
    known.add(key);
  }

  return setWorkspaceArea(merged, activeArea);
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
