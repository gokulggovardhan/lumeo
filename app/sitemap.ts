import type { MetadataRoute } from "next";
import { PUBLIC_ROUTE_CONFIG } from "@/lib/public-site/routes";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://lumeo.in";
  const lastModified = new Date();

  return PUBLIC_ROUTE_CONFIG.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
