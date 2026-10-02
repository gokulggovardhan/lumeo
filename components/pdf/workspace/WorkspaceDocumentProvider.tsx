"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import {
  appendWorkspaceCheckpoint,
  canRedoWorkspaceCheckpoint,
  canUndoWorkspaceCheckpoint,
  createWorkspaceRevisionHistory,
  currentWorkspaceCheckpoint,
  redoWorkspaceCheckpoint,
  replaceCurrentWorkspaceCheckpoint,
  undoWorkspaceCheckpoint,
  type WorkspaceRevisionHistory,
} from "@/lib/pdf/workspace/revisionHistory";
import type { DocumentSession } from "@/lib/pdf/workspace/session";
import {
  createWorkspaceRuntime,
  createWorkspaceRuntimeFromSession,
  mergeWorkspaceSessions,
  publishWorkspaceRevision,
  updateWorkspaceRuntimeSession,
  workspaceRuntimeBytes,
  type PublishWorkspaceRevisionInput,
  type WorkspaceDocumentRuntime,
} from "@/lib/pdf/workspace/runtime";

type StartWorkspaceDocumentInput = {
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  initialArea: WorkspaceArea;
};

type PublishSharedRevisionInput = Omit<
  PublishWorkspaceRevisionInput,
  "expectedRevision"
> & {
  expectedRevision?: number;
};

type StageWorkspaceContinuationInput = {
  target: WorkspaceArea;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  session: DocumentSession;
};

export type WorkspaceContinuationPayload = {
  file: File;
  runtime: WorkspaceDocumentRuntime;
};

export type WorkspaceGlobalHistoryState = {
  connected: boolean;
  canUndo: boolean;
  canRedo: boolean;
  checkpointCount: number;
  cursor: number;
};

const EMPTY_GLOBAL_HISTORY: WorkspaceGlobalHistoryState = {
  connected: false,
  canUndo: false,
  canRedo: false,
  checkpointCount: 0,
  cursor: 0,
};

type WorkspaceDocumentContextValue = {
  document: WorkspaceDocumentRuntime | null;
  continuationTarget: WorkspaceArea | null;
  globalHistory: WorkspaceGlobalHistoryState;
  undoWorkspace: () => WorkspaceDocumentRuntime | null;
  redoWorkspace: () => WorkspaceDocumentRuntime | null;
  startDocument: (
    input: StartWorkspaceDocumentInput,
  ) => WorkspaceDocumentRuntime;
  publishRevision: (
    input: PublishSharedRevisionInput,
  ) => WorkspaceDocumentRuntime | null;
  replaceSession: (session: DocumentSession) => WorkspaceDocumentRuntime | null;
  stageContinuation: (
    input: StageWorkspaceContinuationInput,
  ) => WorkspaceDocumentRuntime;
  takeContinuation: (
    target: WorkspaceArea,
  ) => WorkspaceContinuationPayload | null;
  fileForCurrentRevision: () => File | null;
  clearDocument: () => void;
};

function assertContinuationTransfer(
  previous: WorkspaceDocumentRuntime | null,
  input: StageWorkspaceContinuationInput,
  next: WorkspaceDocumentRuntime,
): void {
  const continuesCurrentDocument =
    previous?.session.state.document.id === input.session.state.document.id;
  const expectedRevision = continuesCurrentDocument
    ? previous.revision.number + 1
    : 0;

  if (next.revision.number !== expectedRevision) {
    throw new Error("Workspace continuation revision did not advance safely.");
  }
  if (next.revision.fileName !== input.fileName) {
    throw new Error("Workspace continuation filename changed unexpectedly.");
  }
  if (next.revision.pageCount !== input.pageCount) {
    throw new Error("Workspace continuation page count changed unexpectedly.");
  }
  if (next.revision.byteLength !== input.bytes.byteLength) {
    throw new Error("Workspace continuation bytes changed unexpectedly.");
  }
  if (next.session.state.document.id !== input.session.state.document.id) {
    throw new Error("Workspace continuation changed document identity.");
  }
  if (next.session.state.activeArea !== input.target) {
    throw new Error("Workspace continuation opened the wrong tool area.");
  }
}

const WorkspaceDocumentContext =
  createContext<WorkspaceDocumentContextValue | null>(null);

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function WorkspaceDocumentProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [document, setDocument] =
    useState<WorkspaceDocumentRuntime | null>(null);
  const documentRef = useRef<WorkspaceDocumentRuntime | null>(null);
  const [continuationTarget, setContinuationTarget] =
    useState<WorkspaceArea | null>(null);
  const continuationTargetRef = useRef<WorkspaceArea | null>(null);
  const historyRef = useRef<WorkspaceRevisionHistory | null>(null);
  const [globalHistory, setGlobalHistory] =
    useState<WorkspaceGlobalHistoryState>(EMPTY_GLOBAL_HISTORY);

  const commit = useCallback((next: WorkspaceDocumentRuntime | null) => {
    documentRef.current = next;
    setDocument(next);
    return next;
  }, []);

  const syncHistory = useCallback((history: WorkspaceRevisionHistory | null) => {
    historyRef.current = history;
    if (!history) {
      setGlobalHistory(EMPTY_GLOBAL_HISTORY);
      return;
    }
    setGlobalHistory({
      connected: true,
      canUndo: canUndoWorkspaceCheckpoint(history),
      canRedo: canRedoWorkspaceCheckpoint(history),
      checkpointCount: history.checkpoints.length,
      cursor: history.cursor,
    });
  }, []);

  const setContinuationTargetSafely = useCallback((area: WorkspaceArea | null) => {
    continuationTargetRef.current = area;
    setContinuationTarget(area);
  }, []);

  const startDocument = useCallback(
    (input: StartWorkspaceDocumentInput) => {
      const id = createId("workspace");
      syncHistory(null);
      setContinuationTargetSafely(null);
      return commit(
        createWorkspaceRuntime({
          id,
          sourceId: createId("source"),
          fileName: input.fileName,
          bytes: input.bytes,
          pageCount: input.pageCount,
          initialArea: input.initialArea,
        }),
      )!;
    },
    [commit, setContinuationTargetSafely, syncHistory],
  );

  const publishRevision = useCallback(
    (input: PublishSharedRevisionInput) => {
      const current = documentRef.current;
      if (!current) return null;

      const next = publishWorkspaceRevision(current, {
        ...input,
        expectedRevision:
          input.expectedRevision ?? current.revision.number,
      });
      const history = historyRef.current;
      if (history) {
        syncHistory(appendWorkspaceCheckpoint(history, next));
      }
      return commit(next);
    },
    [commit, syncHistory],
  );

  const replaceSession = useCallback(
    (session: DocumentSession) => {
      const current = documentRef.current;
      if (!current) return null;
      const next = updateWorkspaceRuntimeSession(current, session);
      const history = historyRef.current;
      if (history) {
        syncHistory(replaceCurrentWorkspaceCheckpoint(history, next));
      }
      return commit(next);
    },
    [commit, syncHistory],
  );

  const stageContinuation = useCallback(
    (input: StageWorkspaceContinuationInput) => {
      const current = documentRef.current;
      let next: WorkspaceDocumentRuntime;

      if (
        current &&
        current.session.state.document.id === input.session.state.document.id
      ) {
        const session = mergeWorkspaceSessions(
          current.session,
          input.session,
          input.target,
        );
        next = publishWorkspaceRevision(current, {
          expectedRevision: current.revision.number,
          bytes: input.bytes,
          fileName: input.fileName,
          pageCount: input.pageCount,
          area: input.target,
          document: input.session.state.document,
          session,
        });
      } else {
        next = createWorkspaceRuntimeFromSession({
          id: createId("workspace"),
          fileName: input.fileName,
          bytes: input.bytes,
          pageCount: input.pageCount,
          area: input.target,
          session: input.session,
        });
      }

      assertContinuationTransfer(current, input, next);
      const history = historyRef.current;
      if (
        history &&
        current &&
        current.session.state.document.id === next.session.state.document.id
      ) {
        syncHistory(appendWorkspaceCheckpoint(history, next));
      } else if (
        current &&
        current.session.state.document.id === next.session.state.document.id
      ) {
        syncHistory(
          appendWorkspaceCheckpoint(
            createWorkspaceRevisionHistory(current),
            next,
          ),
        );
      } else {
        syncHistory(createWorkspaceRevisionHistory(next));
      }
      commit(next);
      setContinuationTargetSafely(input.target);
      return next;
    },
    [commit, setContinuationTargetSafely, syncHistory],
  );

  const takeContinuation = useCallback((target: WorkspaceArea) => {
    const current = documentRef.current;
    if (!current || continuationTargetRef.current !== target) return null;

    setContinuationTargetSafely(null);
    return {
      file: new File(
        [workspaceRuntimeBytes(current)],
        current.revision.fileName,
        { type: "application/pdf" },
      ),
      runtime: current,
    };
  }, [setContinuationTargetSafely]);

  const undoWorkspace = useCallback(() => {
    const history = historyRef.current;
    if (!history || !canUndoWorkspaceCheckpoint(history)) return null;
    const nextHistory = undoWorkspaceCheckpoint(history);
    const restored = currentWorkspaceCheckpoint(nextHistory);
    syncHistory(nextHistory);
    commit(restored);
    setContinuationTargetSafely(restored.session.state.activeArea);
    return restored;
  }, [commit, setContinuationTargetSafely, syncHistory]);

  const redoWorkspace = useCallback(() => {
    const history = historyRef.current;
    if (!history || !canRedoWorkspaceCheckpoint(history)) return null;
    const nextHistory = redoWorkspaceCheckpoint(history);
    const restored = currentWorkspaceCheckpoint(nextHistory);
    syncHistory(nextHistory);
    commit(restored);
    setContinuationTargetSafely(restored.session.state.activeArea);
    return restored;
  }, [commit, setContinuationTargetSafely, syncHistory]);

  const fileForCurrentRevision = useCallback(() => {
    const current = documentRef.current;
    if (!current) return null;
    return new File(
      [workspaceRuntimeBytes(current)],
      current.revision.fileName,
      { type: "application/pdf" },
    );
  }, []);

  const clearDocument = useCallback(() => {
    setContinuationTargetSafely(null);
    syncHistory(null);
    commit(null);
  }, [commit, setContinuationTargetSafely, syncHistory]);

  const value = useMemo<WorkspaceDocumentContextValue>(
    () => ({
      document,
      continuationTarget,
      globalHistory,
      undoWorkspace,
      redoWorkspace,
      startDocument,
      publishRevision,
      replaceSession,
      stageContinuation,
      takeContinuation,
      fileForCurrentRevision,
      clearDocument,
    }),
    [
      clearDocument,
      continuationTarget,
      document,
      fileForCurrentRevision,
      globalHistory,
      redoWorkspace,
      publishRevision,
      replaceSession,
      stageContinuation,
      startDocument,
      takeContinuation,
      undoWorkspace,
    ],
  );

  return (
    <WorkspaceDocumentContext.Provider value={value}>
      {children}
    </WorkspaceDocumentContext.Provider>
  );
}

export function useWorkspaceDocument(): WorkspaceDocumentContextValue {
  const context = useContext(WorkspaceDocumentContext);
  if (!context) {
    throw new Error(
      "useWorkspaceDocument must be used inside WorkspaceDocumentProvider.",
    );
  }
  return context;
}
