import type { WorkspaceArea, WorkspaceOperation } from "./model.ts";

export const WORKSPACE_AREA_PRESENTATION: Record<
  WorkspaceArea,
  { label: string; description: string }
> = {
  edit: { label: "Edit", description: "Text & content" },
  pages: { label: "Pages", description: "Arrange & manage" },
  sign: { label: "Sign", description: "Signatures & initials" },
  enhance: { label: "Add", description: "Watermarks & numbering" },
  optimize: { label: "Compress", description: "Reduce file size" },
  export: { label: "Finish", description: "Review & export" },
};

export function workspaceAreaLabel(area: WorkspaceArea): string {
  return WORKSPACE_AREA_PRESENTATION[area].label;
}

export function workspaceAreaDescription(area: WorkspaceArea): string {
  return WORKSPACE_AREA_PRESENTATION[area].description;
}

export function visibleWorkspaceHistory(
  operations: readonly WorkspaceOperation[],
  cursor: number,
  limit = 4,
): readonly WorkspaceOperation[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (safeLimit === 0 || cursor <= 0) return [];
  return operations.slice(0, cursor).slice(-safeLimit).reverse();
}

export const WORKSPACE_AREA_ROUTE: Partial<Record<WorkspaceArea, string>> = {
  edit: "/pdf/edit",
  pages: "/pdf/organize",
  sign: "/pdf/sign",
  enhance: "/pdf/watermark",
  optimize: "/pdf/compress",
};

export function workspaceAreaRoute(area: WorkspaceArea): string | null {
  return WORKSPACE_AREA_ROUTE[area] ?? null;
}
