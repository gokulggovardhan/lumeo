export type PublicRouteConfig = {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
};

/**
 * Canonical public-route registry for sitemap generation and Admin SEO
 * coverage. Keep public route inventory in one place so the operator console
 * cannot drift from the live sitemap.
 */
export const PUBLIC_ROUTE_CONFIG = [
  { path: "/heic-to-jpeg", changeFrequency: "monthly", priority: 0.8 },
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pdf", changeFrequency: "weekly", priority: 0.9 },
  { path: "/pdf-tools", changeFrequency: "weekly", priority: 0.9 },
  { path: "/pdf/merge", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/split", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/compress", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/jpg-to-pdf", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/pdf-to-jpg", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/sign", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/organize", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/extract-text", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/edit", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/watermark", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/crop", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/page-numbers", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/header-footer", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/word-to-pdf", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/pdf-to-word", changeFrequency: "monthly", priority: 0.8 },
  { path: "/pdf/html-to-pdf", changeFrequency: "monthly", priority: 0.8 },
  { path: "/guides", changeFrequency: "monthly", priority: 0.65 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.55 },
  { path: "/accessibility", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.55 },
] as const satisfies readonly PublicRouteConfig[];

export const PUBLIC_ROUTE_PATHS: readonly string[] = PUBLIC_ROUTE_CONFIG.map((route) => route.path);
