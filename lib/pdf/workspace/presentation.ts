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
  return operations.slice(0, cursor).slice(-Math.max(0, limit)).reverse();
}
