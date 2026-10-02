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

type WorkspaceDocumentContextValue = {
  document: WorkspaceDocumentRuntime | null;
  startDocument: (
    input: StartWorkspaceDocumentInput,
  ) => WorkspaceDocumentRuntime;
  publishRevision: (
    input: PublishSharedRevisionInput,
  ) => WorkspaceDocumentRuntime | null;
  replaceSession: (session: DocumentSession) => WorkspaceDocumentRuntime | null;
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
    commit(null);
  }, [commit]);

  const value = useMemo<WorkspaceDocumentContextValue>(
    () => ({
      document,
      startDocument,
      publishRevision,
      replaceSession,
      fileForCurrentRevision,
      clearDocument,
    }),
    [
      clearDocument,
      document,
      fileForCurrentRevision,
      publishRevision,
      replaceSession,
      startDocument,
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
