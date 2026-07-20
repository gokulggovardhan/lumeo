import "server-only";

import { lumeoTools, type LumeoTool, type ToolAction } from "@/lib/tools/catalog";
import type { PublicPdfTool } from "@/lib/public-catalog/types";

// Bridges the static Lumeo tool model (names, glyphs, grouping -- a design
// decision, reviewed via PR) with the existing admin-controlled catalog in
// Supabase (pdf_tools.status/is_enabled, edited from the Control Center).
// Action slugs are shared between both ("merge", "split", "compress",
// "jpg-to-pdf", "pdf-to-jpg"), so an admin flipping a tool's status there
// now flows through to every public surface without a second admin UI or a
// second source of truth to drift out of sync with.

export type ResolvedTool = LumeoTool & {
  // The route to link to right now. Prefers the coded primaryRoute if it's
  // still live per the DB; otherwise the first live action's route; undefined
  // if the admin has disabled every action this tool exposes -- callers must
  // treat that as "not currently open-able" regardless of the static
  // `availability` field.
  effectivePrimaryRoute?: string;
};

export function resolveLumeoTools(dbTools: PublicPdfTool[]): ResolvedTool[] {
  const dbBySlug = new Map(dbTools.map((tool) => [tool.toolSlug, tool]));

  return lumeoTools.map((tool) => {
    const actions: ToolAction[] = tool.actions.map((action) => {
      const dbTool = dbBySlug.get(action.slug);
      if (!dbTool) return action;

      const live = dbTool.status === "active" || dbTool.status === "beta";
      return { ...action, live, route: live ? action.route ?? dbTool.route : action.route };
    });

    const liveRoutes = actions.filter((action) => action.live && action.route);
    const effectivePrimaryRoute =
      tool.primaryRoute && liveRoutes.some((action) => action.route === tool.primaryRoute)
        ? tool.primaryRoute
        : liveRoutes[0]?.route;

    return { ...tool, actions, effectivePrimaryRoute };
  });
}
