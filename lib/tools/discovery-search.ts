import type { Tile } from "@/lib/tools/tiles";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function toolMatchesQuery(tool: Tile, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;

  return [
    tool.label,
    tool.description,
    tool.categoryLabel,
    tool.brandedCategory,
    ...tool.aliases,
    ...tool.capabilities,
  ].some((value) => normalize(value).includes(normalizedQuery));
}
