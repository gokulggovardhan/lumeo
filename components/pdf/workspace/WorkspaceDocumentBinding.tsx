"use client";

import { useEffect } from "react";
import type {
  WorkspaceArea,
  WorkspaceDocument,
} from "@/lib/pdf/workspace/model";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

export function WorkspaceDocumentBinding({
  area,
  fileName,
  bytes,
  pageCount,
  document,
  hasUnsavedChanges = false,
}: {
  area: WorkspaceArea;
  fileName: string;
  bytes: ArrayBuffer;
  pageCount: number;
  document: WorkspaceDocument;
  hasUnsavedChanges?: boolean;
}) {
  const { adoptDocument, reportDraftUnsavedChanges } = useWorkspaceDocument();

  useEffect(() => {
    adoptDocument({
      area,
      fileName,
      bytes,
      pageCount,
      document,
    });
  }, [adoptDocument, area, bytes, document, fileName, pageCount]);

  useEffect(() => {
    reportDraftUnsavedChanges(hasUnsavedChanges);
    return () => reportDraftUnsavedChanges(false);
  }, [hasUnsavedChanges, reportDraftUnsavedChanges]);

  return null;
}
