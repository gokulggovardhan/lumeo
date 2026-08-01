import "server-only";

import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getSupabaseEnv } from "@/lib/supabase/env";
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

// Plain, cookie-free client for the two unstable_cache-wrapped reads below.
// The cookie-aware client in lib/supabase/server.ts calls next/headers'
// cookies() -- a Dynamic API -- which this Next.js version rejects when
// invoked from inside a function wrapped by unstable_cache(), throwing
// "Route ... used cookies() inside a function cached with unstable_cache()".
// That exception was landing in the catch block below on every request,
// silently activating the hardcoded fallback catalog. Neither RPC needs a
// user session (both are public, anon-key-readable), so a plain client
// sidesteps the restriction entirely instead of working around it.
function createPublicCatalogClient() {
  const { url, publishableKey } = getSupabaseEnv();
  return createClient(url, publishableKey);
}

async function fetchPublicPdfCatalog(): Promise<PublicCatalogResult> {
  try {
    const supabase = createPublicCatalogClient();
    const { data, error } = await supabase.rpc("get_public_pdf_catalog");
    if (error || !Array.isArray(data)) {
      console.warn("Lumeo public catalog fallback active.", error?.message ?? "unexpected response shape");
      return getFallbackPublicCatalog();
    }

    const tools = (data as PublicCatalogRow[])
      .map(mapCatalogRow)
      .filter((tool): tool is PublicPdfTool => Boolean(tool));

    if (tools.length === 0) {
      console.warn("Lumeo public catalog fallback active.", "rpc returned 0 mappable rows");
      return getFallbackPublicCatalog();
    }

    return {
      tools,
      categories: groupPublicTools(tools),
      source: "supabase",
    };
  } catch (err) {
    console.warn("Lumeo public catalog fallback active.", err instanceof Error ? err.message : String(err));
    return getFallbackPublicCatalog();
  }
}

async function fetchPublicHomepageTools(): Promise<PublicHomepageTool[]> {
  try {
    const supabase = createPublicCatalogClient();
    const { data, error } = await supabase.rpc("get_public_homepage_tools");
    if (error || !Array.isArray(data)) {
      console.warn("Lumeo homepage tool fallback active.", error?.message ?? "unexpected response shape");
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
  tags: ["public-pdf-catalog"],
});

export const getPublicHomepageTools = unstable_cache(fetchPublicHomepageTools, ["lumeo-public-homepage-tools"], {
  revalidate: 300,
});
