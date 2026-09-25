import type { ToolWithCategory } from "@/lib/admin/data";

export type ToolEnabledFilter = "all" | "enabled" | "disabled";
export type ToolMaintenanceFilter = "all" | "maintenance" | "clear";

export type ToolFilters = {
  query: string;
  category: string;
  status: string;
  enabled: ToolEnabledFilter;
  maintenance: ToolMaintenanceFilter;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function resolveToolFilters(params: Record<string, string | string[] | undefined>): ToolFilters {
  const enabled = first(params.enabled);
  const maintenance = first(params.maintenance);

  return {
    query: first(params.q).trim().slice(0, 120),
    category: first(params.category).trim(),
    status: first(params.status).trim(),
    enabled: enabled === "enabled" || enabled === "disabled" ? enabled : "all",
    maintenance:
      maintenance === "maintenance" || maintenance === "clear" ? maintenance : "all",
  };
}

export function hasActiveToolFilters(filters: ToolFilters) {
  return Boolean(
    filters.query ||
      filters.category ||
      filters.status ||
      filters.enabled !== "all" ||
      filters.maintenance !== "all",
  );
}

export function filterAdminTools(tools: ToolWithCategory[], filters: ToolFilters) {
  const query = filters.query.toLocaleLowerCase();

  return tools.filter((tool) => {
    if (
      query &&
      ![tool.name, tool.slug, tool.route, tool.short_description, tool.category_name ?? ""]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query)
    ) {
      return false;
    }
    if (filters.category && tool.category_slug !== filters.category) return false;
    if (filters.status && tool.status !== filters.status) return false;
    if (filters.enabled === "enabled" && !tool.is_enabled) return false;
    if (filters.enabled === "disabled" && tool.is_enabled) return false;

    const inMaintenance = tool.status === "maintenance";
    if (filters.maintenance === "maintenance" && !inMaintenance) return false;
    if (filters.maintenance === "clear" && inMaintenance) return false;
    return true;
  });
}
