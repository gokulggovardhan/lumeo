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
  appendWorkspaceRevision,
  createWorkspaceRevisionHistory,
  currentWorkspaceRevision,
  redoWorkspaceRevision,
  undoWorkspaceRevision,
  type WorkspaceRevision,
  type WorkspaceRevisionHistory,
} from "@/lib/pdf/workspace/revisionHistory";

const REVISION_FILE_MARKER = Symbol.for("lumeo.workspace.revision");

type WorkspaceTaggedFile = File & {
  [REVISION_FILE_MARKER]?: string;
};

export type WorkspaceRuntimeState = {
  sessionId: string;
  history: WorkspaceRevisionHistory;
  activeArea: WorkspaceArea;
  dirty: boolean;
  dirtyArea: WorkspaceArea | null;
};

export type WorkspaceCommitInput = {
  blob: Blob;
  filename: string;
  pageCount?: number;
  area: WorkspaceArea;
  description: string;
};

type WorkspaceSessionContextValue = {
  state: WorkspaceRuntimeState | null;
  currentRevision: WorkspaceRevision | null;
  canUndoRevision: boolean;
  canRedoRevision: boolean;
  openDocument: (input: {
    file: File;
    pageCount?: number;
    area: WorkspaceArea;
  }) => void;
  commitRevision: (input: WorkspaceCommitInput) => void;
  markDirty: (dirty: boolean, area?: WorkspaceArea) => void;
  setActiveArea: (area: WorkspaceArea) => void;
  undoRevision: () => void;
  redoRevision: () => void;
  clearSession: () => void;
  getCurrentFile: () => File | null;
};

const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);

function sessionId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function tagWorkspaceFile(file: File, revisionId: string): File {
  Object.defineProperty(file, REVISION_FILE_MARKER, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: revisionId,
  });
  return file;
}

function revisionIdFromFile(file: File): string | undefined {
  return (file as WorkspaceTaggedFile)[REVISION_FILE_MARKER];
}

export function WorkspaceSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const sequenceRef = useRef(1);
  const [state, setState] = useState<WorkspaceRuntimeState | null>(null);

  const currentRevision = useMemo(
    () => (state ? currentWorkspaceRevision(state.history) : null),
    [state],
  );

  const openDocument = useCallback(
    ({
      file,
      pageCount,
      area,
    }: {
      file: File;
      pageCount?: number;
      area: WorkspaceArea;
    }) => {
      setState((current) => {
        const taggedRevisionId = revisionIdFromFile(file);
        if (current && taggedRevisionId) {
          const active = currentWorkspaceRevision(current.history);
          if (active.id === taggedRevisionId) {
            const revisions = current.history.revisions.map((revision) =>
              revision.id === active.id && pageCount !== undefined
                ? { ...revision, pageCount }
                : revision,
            );
            return {
              ...current,
              history: { ...current.history, revisions },
              activeArea: area,
              dirty: false,
              dirtyArea: null,
            };
          }
        }

        const revision: WorkspaceRevision = {
          id: `source-${sequenceRef.current++}`,
          blob: file,
          filename: file.name || "document.pdf",
          byteLength: file.size,
          pageCount,
          area,
          description: "Opened document",
          createdAt: Date.now(),
        };
        return {
          sessionId: sessionId(),
          history: createWorkspaceRevisionHistory(revision),
          activeArea: area,
          dirty: false,
          dirtyArea: null,
        };
      });
    },
    [],
  );

  const commitRevision = useCallback((input: WorkspaceCommitInput) => {
    setState((current) => {
      if (!current) return current;
      const revision: WorkspaceRevision = {
        id: `revision-${sequenceRef.current++}`,
        blob: input.blob,
        filename: input.filename || currentWorkspaceRevision(current.history).filename,
        byteLength: input.blob.size,
        pageCount:
          input.pageCount ??
          currentWorkspaceRevision(current.history).pageCount,
        area: input.area,
        description: input.description,
        createdAt: Date.now(),
      };
      return {
        ...current,
        history: appendWorkspaceRevision(current.history, revision),
        activeArea: input.area,
        dirty: false,
        dirtyArea: null,
      };
    });
  }, []);

  const markDirty = useCallback((dirty: boolean, area?: WorkspaceArea) => {
    setState((current) =>
      current
        ? {
            ...current,
            activeArea: area ?? current.activeArea,
            dirty,
            dirtyArea: dirty ? (area ?? current.activeArea) : null,
          }
        : current,
    );
  }, []);

  const setActiveArea = useCallback((area: WorkspaceArea) => {
    setState((current) =>
      current ? { ...current, activeArea: area } : current,
    );
  }, []);

  const undoRevision = useCallback(() => {
    setState((current) => {
      if (!current || current.dirty) return current;
      const history = undoWorkspaceRevision(current.history);
      const active = currentWorkspaceRevision(history);
      return { ...current, history, activeArea: active.area };
    });
  }, []);

  const redoRevision = useCallback(() => {
    setState((current) => {
      if (!current || current.dirty) return current;
      const history = redoWorkspaceRevision(current.history);
      const active = currentWorkspaceRevision(history);
      return { ...current, history, activeArea: active.area };
    });
  }, []);

  const clearSession = useCallback(() => {
    setState(null);
  }, []);

  const getCurrentFile = useCallback(() => {
    if (!state) return null;
    const revision = currentWorkspaceRevision(state.history);
    return tagWorkspaceFile(
      new File([revision.blob], revision.filename, {
        type: "application/pdf",
        lastModified: Date.now(),
      }),
      revision.id,
    );
  }, [state]);

  const value = useMemo<WorkspaceSessionContextValue>(
    () => ({
      state,
      currentRevision,
      canUndoRevision: Boolean(state && !state.dirty && state.history.cursor > 0),
      canRedoRevision: Boolean(
        state &&
          !state.dirty &&
          state.history.cursor < state.history.revisions.length - 1,
      ),
      openDocument,
      commitRevision,
      markDirty,
      setActiveArea,
      undoRevision,
      redoRevision,
      clearSession,
      getCurrentFile,
    }),
    [
      state,
      currentRevision,
      openDocument,
      commitRevision,
      markDirty,
      setActiveArea,
      undoRevision,
      redoRevision,
      clearSession,
      getCurrentFile,
    ],
  );

  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useOptionalWorkspaceSession(): WorkspaceSessionContextValue | null {
  return useContext(WorkspaceSessionContext);
}

export function useWorkspaceSession(): WorkspaceSessionContextValue {
  const value = useOptionalWorkspaceSession();
  if (!value) {
    throw new Error(
      "useWorkspaceSession must be used inside WorkspaceSessionProvider.",
    );
  }
  return value;
}
