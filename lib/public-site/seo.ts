import "server-only";

import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { withPublicSocialImages } from "@/lib/public-site/metadata";

type SeoOverride = {
  title: string;
  description: string;
  canonicalPath: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
  openGraphTitle: string | null;
  openGraphDescription: string | null;
};

function parseSeoOverride(value: unknown): SeoOverride | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || typeof record.description !== "string") return null;
  return {
    title: record.title,
    description: record.description,
    canonicalPath: typeof record.canonical_path === "string" ? record.canonical_path : null,
    robotsIndex: record.robots_index !== false,
    robotsFollow: record.robots_follow !== false,
    openGraphTitle: typeof record.open_graph_title === "string" ? record.open_graph_title : null,
    openGraphDescription: typeof record.open_graph_description === "string" ? record.open_graph_description : null,
  };
}

// Public SEO overrides do not require a session. Avoid creating a cookie-aware
// SSR client for every page's metadata: the unnecessary cookies() dependency
// forces dynamic rendering, and the network RPC delays text-first LCP on
// public pages. Revalidate on the same cadence as the public tool catalog.
const readPublicSeoOverride = unstable_cache(
  async (route: string): Promise<SeoOverride | null> => {
    try {
      const { url, publishableKey } = getSupabaseEnv();
      const client = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const { data, error } = await client.rpc("get_public_seo_setting", { p_route: route });
      if (error) return null;
      return parseSeoOverride(data);
    } catch {
      return null;
    }
  },
  ["lumeo-public-seo-override"],
  { revalidate: 300, tags: ["public-seo-setting"] },
);

// Any failed/unconfigured public lookup falls back to the existing safe
// metadata. Never cache an authenticated or user-specific SEO response.
export async function withSeoOverride(route: string, defaultMetadata: Metadata): Promise<Metadata> {
  const fallbackMetadata = withPublicSocialImages(defaultMetadata);
  const override = await readPublicSeoOverride(route);
  if (!override) return fallbackMetadata;

  try {
    return {
      ...fallbackMetadata,
      title: override.title,
      description: override.description,
      alternates: {
        ...fallbackMetadata.alternates,
        canonical: override.canonicalPath ?? fallbackMetadata.alternates?.canonical,
      },
      robots: {
        index: override.robotsIndex,
        follow: override.robotsFollow,
      },
      openGraph: {
        ...fallbackMetadata.openGraph,
        title: override.openGraphTitle ?? fallbackMetadata.openGraph?.title,
        description: override.openGraphDescription ?? fallbackMetadata.openGraph?.description,
      },
    };
  } catch {
    return fallbackMetadata;
  }
}
