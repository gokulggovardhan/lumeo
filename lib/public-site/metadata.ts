import type { Metadata } from "next";

export const PUBLIC_OPEN_GRAPH_IMAGE = "https://lumeo.in/opengraph-image";
export const PUBLIC_TWITTER_IMAGE = "https://lumeo.in/twitter-image";

/**
 * Public pages should always ship a complete social-preview image contract.
 * Route-specific metadata can still provide its own images; these are only
 * safe fallbacks for pages that define Open Graph/Twitter metadata without
 * explicitly repeating the site-wide image URLs.
 */
export function withPublicSocialImages(metadata: Metadata): Metadata {
  const openGraph = metadata.openGraph
    ? {
        ...metadata.openGraph,
        images: metadata.openGraph.images ?? [PUBLIC_OPEN_GRAPH_IMAGE],
      }
    : metadata.openGraph;

  const twitter = metadata.twitter
    ? {
        ...metadata.twitter,
        images: metadata.twitter.images ?? [PUBLIC_TWITTER_IMAGE],
      }
    : {
        card: "summary_large_image" as const,
        images: [PUBLIC_TWITTER_IMAGE],
      };

  return {
    ...metadata,
    ...(openGraph ? { openGraph } : {}),
    twitter,
  };
}
