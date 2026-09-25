export type WorkspaceArea = "edit" | "pages" | "sign" | "enhance" | "optimize" | "export";
export type WorkspaceLifecycle = "empty" | "loading" | "ready" | "modified" | "exporting" | "exported" | "error";
export type WorkspacePrivacyState = "local" | "server-required";
export type WorkspaceSourceId = string;
export type WorkspacePageId = string;

export type WorkspacePageProvenance = {
  sourceDocumentId: WorkspaceSourceId;
  sourcePageNumber: number;
};

export type WorkspacePage = {
  id: WorkspacePageId;
  provenance: WorkspacePageProvenance;
  rotation: 0 | 90 | 180 | 270;
  deleted: boolean;
};

export type WorkspaceOperationScope =
  | { kind: "pages"; pageIds: readonly WorkspacePageId[] }
  | { kind: "selection"; pageIds: readonly WorkspacePageId[] }
  | { kind: "all-current-pages"; resolvedPageIds: readonly WorkspacePageId[] }
  | { kind: "all-final-pages" }
  | { kind: "page-range"; from: number; to: number; resolvedPageIds: readonly WorkspacePageId[] }
  | { kind: "document" }
  | { kind: "export" };

export type WorkspaceFlowEligibility =
  | { eligible: true; version: 1 }
  | { eligible: false; reason: "content-specific" | "page-specific" | "sensitive" | "non-portable" };

export type WorkspaceOperation = {
  id: string;
  type: string;
  area: WorkspaceArea;
  description: string;
  scope: WorkspaceOperationScope;
  parameters: Readonly<Record<string, unknown>>;
  undoable: boolean;
  affectsPreview: boolean;
  affectsExport: boolean;
  flow: WorkspaceFlowEligibility;
};

export type WorkspaceSource = {
  id: WorkspaceSourceId;
  name: string;
  byteLength: number;
  pageCount: number;
};

export type WorkspaceDocument = {
  id: string;
  sources: readonly WorkspaceSource[];
  pages: readonly WorkspacePage[];
};

export type WorkspaceSessionState = {
  id: string;
  document: WorkspaceDocument;
  lifecycle: WorkspaceLifecycle;
  privacy: WorkspacePrivacyState;
  activeArea: WorkspaceArea;
  selectedPageIds: readonly WorkspacePageId[];
  historyCursor: number;
  operationCount: number;
  hasUnsavedChanges: boolean;
};

export function createSourcePages(sourceDocumentId: string, pageCount: number): WorkspacePage[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    id: `${sourceDocumentId}:page:${index + 1}`,
    provenance: { sourceDocumentId, sourcePageNumber: index + 1 },
    rotation: 0,
    deleted: false,
  }));
}

export function createWorkspaceDocument(id: string, source: WorkspaceSource): WorkspaceDocument {
  return { id, sources: [source], pages: createSourcePages(source.id, source.pageCount) };
}

export function assertUniquePageIds(pages: readonly WorkspacePage[]): void {
  const ids = new Set<string>();
  for (const page of pages) {
    if (ids.has(page.id)) throw new Error(`Duplicate workspace page id: ${page.id}`);
    ids.add(page.id);
  }
}
