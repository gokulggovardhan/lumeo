export type PublicRouteConfig = {
  path: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
  /**
   * Source-controlled ISO calendar date for a known meaningful page change.
   * Omit this when the page's last meaningful change is not known reliably.
   */
  lastModified?: `${number}-${number}-${number}`;
};

/**
 * Canonical public-route registry for sitemap generation and Admin SEO
 * coverage. Keep public route inventory in one place so the operator console
 * cannot drift from the live sitemap.
 */
export const PUBLIC_ROUTE_CONFIG: readonly PublicRouteConfig[] = [
  // GSC-backed visible tool-content enrichment, PR #593 (a5860d9f).
  { path: "/heic-to-jpeg", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  // Hybrid entry release, PR #573 (498ef1ff). Update per meaningful page change.
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: "2026-10-03" },
  { path: "/pdf", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-10-04" },
  { path: "/pdf-tools", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-10-06" },
  // The public tool pages below received the same meaningful PR #593 content update.
  { path: "/pdf/merge", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/split", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/compress", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/jpg-to-pdf", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/pdf-to-jpg", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/sign", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/organize", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/extract-text", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/edit", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/watermark", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/crop", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/page-numbers", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/header-footer", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/word-to-pdf", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/pdf-to-word", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/pdf/html-to-pdf", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-10-04" },
  { path: "/guides", changeFrequency: "monthly", priority: 0.65 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/terms", changeFrequency: "monthly", priority: 0.5 },
  { path: "/security", changeFrequency: "monthly", priority: 0.55 },
  { path: "/accessibility", changeFrequency: "monthly", priority: 0.5 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.55 },
];

export const PUBLIC_ROUTE_PATHS: readonly string[] = PUBLIC_ROUTE_CONFIG.map((route) => route.path);
