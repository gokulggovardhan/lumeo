import type { MetadataRoute } from "next";
import { buildPublicSitemap } from "@/lib/public-site/sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return buildPublicSitemap();
}
