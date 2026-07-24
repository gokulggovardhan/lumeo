import "server-only";

import { getPublicPdfCatalog } from "@/lib/public-catalog/data";

export type ToolBlockedState =
  | { blocked: false }
  | { blocked: true; status: string; message: string | null };

// Each live tool page (app/pdf/<slug>/page.tsx) calls this with its own
// canonical action slug ("merge", "split", ...) to decide whether to render
// the workspace or a maintenance/coming-soon notice instead. Reads the same
// admin-controlled catalog the homepage tiles and nav already resolve from,
// so an admin toggling a tool's status or enabled state here takes effect
// on the tool's own page too, not just its discoverability elsewhere.
export async function getToolBlockedState(slug: string): Promise<ToolBlockedState> {
  const catalog = await getPublicPdfCatalog();
  const dbTool = catalog.tools.find((tool) => tool.toolSlug === slug);
  if (!dbTool) return { blocked: false };

  const live = dbTool.isEnabled && (dbTool.status === "active" || dbTool.status === "beta");
  if (live) return { blocked: false };

  return {
    blocked: true,
    status: dbTool.isEnabled ? dbTool.status : "hidden",
    message: dbTool.maintenanceMessage,
  };
}
