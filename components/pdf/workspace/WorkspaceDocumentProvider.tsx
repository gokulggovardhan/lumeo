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

type WorkspaceDocumentContextValue = {
  document: WorkspaceDocumentRuntime | null;
  continuationTarget: WorkspaceArea | null;
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

  const commit = useCallback((next: WorkspaceDocumentRuntime | null) => {
    documentRef.current = next;
    setDocument(next);
    return next;
  }, []);

  const startDocument = useCallback(
    (input: StartWorkspaceDocumentInput) => {
      const id = createId("workspace");
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
    [commit],
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
      return commit(next);
    },
    [commit],
  );

  const replaceSession = useCallback(
    (session: DocumentSession) => {
      const current = documentRef.current;
      if (!current) return null;
      return commit(updateWorkspaceRuntimeSession(current, session));
    },
    [commit],
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

      commit(next);
      continuationTargetRef.current = input.target;
      setContinuationTarget(input.target);
      return next;
    },
    [commit],
  );

  const takeContinuation = useCallback((target: WorkspaceArea) => {
    const current = documentRef.current;
    if (!current || continuationTargetRef.current !== target) return null;

    continuationTargetRef.current = null;
    setContinuationTarget(null);
    return {
      file: new File(
        [workspaceRuntimeBytes(current)],
        current.revision.fileName,
        { type: "application/pdf" },
      ),
      runtime: current,
    };
  }, []);

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
    continuationTargetRef.current = null;
    setContinuationTarget(null);
    commit(null);
  }, [commit]);

  const value = useMemo<WorkspaceDocumentContextValue>(
    () => ({
      document,
      continuationTarget,
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
      publishRevision,
      replaceSession,
      stageContinuation,
      startDocument,
      takeContinuation,
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
