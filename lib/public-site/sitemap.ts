import type { MetadataRoute } from "next";
import { PUBLIC_ROUTE_CONFIG } from "./routes.ts";

export function buildPublicSitemap(
  baseUrl = "https://lumeo.in",
): MetadataRoute.Sitemap {
  return PUBLIC_ROUTE_CONFIG.map((route) => ({
    url: `${baseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    ...(route.lastModified ? { lastModified: route.lastModified } : {}),
  }));
}
