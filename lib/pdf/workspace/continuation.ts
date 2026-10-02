import type { WorkspaceArea } from "./model";

export type ContinuationArea = Extract<
  WorkspaceArea,
  "edit" | "pages" | "sign" | "enhance" | "optimize"
>;

export type ContinuationTarget = {
  readonly area: ContinuationArea;
  readonly label: string;
  readonly route: string;
};

export const WORKSPACE_CONTINUATION_TARGETS: readonly ContinuationTarget[] = [
  { area: "edit", label: "Edit", route: "/pdf/edit" },
  { area: "pages", label: "Pages", route: "/pdf/organize" },
  { area: "sign", label: "Sign", route: "/pdf/sign" },
  { area: "enhance", label: "Add", route: "/pdf/add" },
  { area: "optimize", label: "Compress", route: "/pdf/compress" },
];

const REPEATABLE_SOURCE_AREAS: readonly ContinuationArea[] = ["enhance"];

export function continuationTargetsFor(
  sourceArea: ContinuationArea,
  incompatibleTargets: readonly ContinuationArea[] = [],
): readonly ContinuationTarget[] {
  const incompatible = new Set(incompatibleTargets);

  return WORKSPACE_CONTINUATION_TARGETS.filter((target) => {
    if (incompatible.has(target.area)) return false;
    if (target.area !== sourceArea) return true;
    return REPEATABLE_SOURCE_AREAS.includes(sourceArea);
  });
}


export function continuationRouteForArea(area: ContinuationArea): string {
  return (
    WORKSPACE_CONTINUATION_TARGETS.find((target) => target.area === area)?.route ??
    "/pdf"
  );
}
