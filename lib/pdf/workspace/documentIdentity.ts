import type { WorkspaceRuntimeRevision } from "./runtime.ts";

export type WorkspaceIdentityRevision = Pick<
  WorkspaceRuntimeRevision,
  "fileName" | "pageCount" | "number" | "byteLength"
>;

export function formatWorkspaceFileSize(byteLength: number): string {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new RangeError("Workspace byte length must be a non-negative integer.");
  }
  if (byteLength < 1024) return String(byteLength) + " B";
  if (byteLength < 1024 * 1024) {
    return (byteLength / 1024).toFixed(1) + " KB";
  }
  const megabytes = byteLength / (1024 * 1024);
  return megabytes.toFixed(megabytes >= 10 ? 0 : 1) + " MB";
}

export function workspacePageLabel(pageCount: number): string {
  return String(pageCount) + (pageCount === 1 ? " page" : " pages");
}

export function workspaceDocumentDescription(revision: WorkspaceIdentityRevision): string {
  return [
    "PDF document " + revision.fileName,
    workspacePageLabel(revision.pageCount),
    "Current revision " + String(revision.number),
    "File size " + formatWorkspaceFileSize(revision.byteLength),
  ].join(". ") + ".";
}
