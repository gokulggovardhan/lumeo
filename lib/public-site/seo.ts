import "server-only";

import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

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

// Any failure (unreachable DB, missing env, unconfigured route) falls back to
// the caller's static defaultMetadata untouched -- SEO records are additive,
// never a way to break a page's metadata.
export async function withSeoOverride(route: string, defaultMetadata: Metadata): Promise<Metadata> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_seo_setting", { p_route: route });
    if (error) return defaultMetadata;

    const override = parseSeoOverride(data);
    if (!override) return defaultMetadata;

    return {
      ...defaultMetadata,
      title: override.title,
      description: override.description,
      alternates: {
        ...defaultMetadata.alternates,
        canonical: override.canonicalPath ?? defaultMetadata.alternates?.canonical,
      },
      robots: {
        index: override.robotsIndex,
        follow: override.robotsFollow,
      },
      openGraph: {
        ...defaultMetadata.openGraph,
        title: override.openGraphTitle ?? defaultMetadata.openGraph?.title,
        description: override.openGraphDescription ?? defaultMetadata.openGraph?.description,
      },
    };
  } catch {
    return defaultMetadata;
  }
}
