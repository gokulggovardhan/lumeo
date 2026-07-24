import "server-only";

import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getFallbackHomepageTools,
  getFallbackPublicCatalog,
  groupPublicTools,
} from "@/lib/public-catalog/fallback";
import type {
  PublicCatalogResult,
  PublicHomepageTool,
  PublicPdfTool,
  PublicToolStatus,
} from "@/lib/public-catalog/types";

type PublicCatalogRow = {
  tool_slug?: unknown;
  tool_name?: unknown;
  short_description?: unknown;
  route?: unknown;
  icon_key?: unknown;
  status?: unknown;
  is_enabled?: unknown;
  maintenance_message?: unknown;
  category_slug?: unknown;
  category_name?: unknown;
  category_description?: unknown;
  category_sort_order?: unknown;
  tool_sort_order?: unknown;
};

type HomepageToolRow = {
  slot_number?: unknown;
  tool_slug?: unknown;
  tool_name?: unknown;
  short_description?: unknown;
  route?: unknown;
  icon_key?: unknown;
  status?: unknown;
};

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStatus(value: unknown): PublicToolStatus | null {
  return value === "active" ||
    value === "beta" ||
    value === "coming_soon" ||
    value === "hidden" ||
    value === "maintenance"
    ? value
    : null;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function mapCatalogRow(row: PublicCatalogRow): PublicPdfTool | null {
  const toolSlug = asString(row.tool_slug);
  const toolName = asString(row.tool_name);
  const shortDescription = asString(row.short_description);
  const route = asString(row.route);
  const iconKey = asString(row.icon_key);
  const status = asStatus(row.status);

  if (!toolSlug || !toolName || !shortDescription || !route || !iconKey || !status || !route.startsWith("/")) {
    return null;
  }

  return {
    toolSlug,
    toolName,
    shortDescription,
    route,
    iconKey,
    status,
    isEnabled: row.is_enabled !== false,
    maintenanceMessage: asString(row.maintenance_message),
    categorySlug: asString(row.category_slug),
    categoryName: asString(row.category_name) ?? "PDF Tools",
    categoryDescription: asString(row.category_description),
    categorySortOrder: asNumber(row.category_sort_order, 9999),
    toolSortOrder: asNumber(row.tool_sort_order, 9999),
  };
}

function mapHomepageRow(row: HomepageToolRow): PublicHomepageTool | null {
  const slotNumber = asNumber(row.slot_number, 0);
  const toolSlug = asString(row.tool_slug);
  const toolName = asString(row.tool_name);
  const shortDescription = asString(row.short_description);
  const route = asString(row.route);
  const iconKey = asString(row.icon_key);
  const status = asStatus(row.status);

  if (slotNumber < 1 || slotNumber > 5 || !toolSlug || !toolName || !shortDescription || !route || !iconKey || !status || !route.startsWith("/")) {
    return null;
  }

  return { slotNumber, toolSlug, toolName, shortDescription, route, iconKey, status };
}

async function fetchPublicPdfCatalog(): Promise<PublicCatalogResult> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_pdf_catalog");
    if (error || !Array.isArray(data)) {
      console.warn("Lumeo public catalog fallback active.");
      return getFallbackPublicCatalog();
    }

    const tools = (data as PublicCatalogRow[])
      .map(mapCatalogRow)
      .filter((tool): tool is PublicPdfTool => Boolean(tool));

    if (tools.length === 0) return getFallbackPublicCatalog();

    return {
      tools,
      categories: groupPublicTools(tools),
      source: "supabase",
    };
  } catch {
    console.warn("Lumeo public catalog fallback active.");
    return getFallbackPublicCatalog();
  }
}

async function fetchPublicHomepageTools(): Promise<PublicHomepageTool[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_homepage_tools");
    if (error || !Array.isArray(data)) {
      console.warn("Lumeo homepage tool fallback active.");
      return getFallbackHomepageTools();
    }

    const tools = (data as HomepageToolRow[])
      .map(mapHomepageRow)
      .filter((tool): tool is PublicHomepageTool => Boolean(tool))
      .sort((a, b) => a.slotNumber - b.slotNumber)
      .slice(0, 5);

    if (tools.length < 5) return getFallbackHomepageTools();

    return tools;
  } catch {
    console.warn("Lumeo homepage tool fallback active.");
    return getFallbackHomepageTools();
  }
}

export const getPublicPdfCatalog = unstable_cache(fetchPublicPdfCatalog, ["lumeo-public-pdf-catalog"], {
  revalidate: 300,
});

export const getPublicHomepageTools = unstable_cache(fetchPublicHomepageTools, ["lumeo-public-homepage-tools"], {
  revalidate: 300,
});
