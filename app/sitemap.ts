import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://lumeo.in/",
      lastModified: new Date("2026-06-22"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
