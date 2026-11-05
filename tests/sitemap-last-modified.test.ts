import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PUBLIC_ROUTE_CONFIG, PUBLIC_ROUTE_PATHS } from "../lib/public-site/routes.ts";
import { buildPublicSitemap } from "../lib/public-site/sitemap.ts";

test("sitemap output stays stable when wall-clock time advances", (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 4) });
  const first = buildPublicSitemap();
  context.mock.timers.tick(86_400_000);
  const second = buildPublicSitemap();
  assert.deepEqual(second, first);

  const sitemapSource = readFileSync("app/sitemap.ts", "utf8");
  assert.doesNotMatch(sitemapSource, /new Date|Date\.now/);
});

test("sitemap uses only explicit source-controlled last-modified dates", () => {
  const entries = buildPublicSitemap();
  const configuredDates = new Map<string, string | undefined>(
    PUBLIC_ROUTE_CONFIG.map((route) => [route.path, route.lastModified]),
  );

  for (const entry of entries) {
    const path = new URL(entry.url).pathname;
    assert.equal(entry.lastModified, configuredDates.get(path));
    if (entry.lastModified) {
      assert.match(String(entry.lastModified), /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test("unchanged PR #593 routes retain their October 4 meaningful-change date", () => {
  const enrichedRoutes = [
    "/pdf",
    "/pdf/organize",
    "/pdf/extract-text",
    "/pdf/crop",
    "/pdf/header-footer",
    "/pdf/html-to-pdf",
  ];

  const configuredDates = new Map(
    PUBLIC_ROUTE_CONFIG.map((route) => [route.path, route.lastModified]),
  );

  for (const path of enrichedRoutes) {
    assert.equal(
      configuredDates.get(path),
      "2026-10-04",
      `${path} should retain the meaningful PR #593 update date`,
    );
  }
});

test("search-intent tool updates expose their October 6 meaningful-change date", () => {
  const updatedRoutes = [
    "/pdf/merge",
    "/pdf/split",
    "/pdf/compress",
    "/pdf/jpg-to-pdf",
    "/pdf/pdf-to-jpg",
    "/pdf/edit",
    "/pdf/word-to-pdf",
    "/pdf/pdf-to-word",
  ];

  const configuredDates = new Map(
    PUBLIC_ROUTE_CONFIG.map((route) => [route.path, route.lastModified]),
  );

  for (const path of updatedRoutes) {
    assert.equal(
      configuredDates.get(path),
      "2026-10-06",
      `${path} should advertise the meaningful search-intent update date`,
    );
  }
});

test("indexing-discovery improvements expose their October 6 meaningful-change date", () => {
  const updatedRoutes = [
    "/heic-to-jpeg",
    "/pdf/sign",
    "/pdf/watermark",
    "/pdf/page-numbers",
  ];

  const configuredDates = new Map(
    PUBLIC_ROUTE_CONFIG.map((route) => [route.path, route.lastModified]),
  );

  for (const path of updatedRoutes) {
    assert.equal(
      configuredDates.get(path),
      "2026-10-06",
      `${path} should advertise the meaningful indexing-discovery update date`,
    );
  }
});

test("PDF tools directory exposes its October 6 semantic SEO update date", () => {
  const pdfTools = PUBLIC_ROUTE_CONFIG.find((route) => route.path === "/pdf-tools");
  assert.equal(pdfTools?.lastModified, "2026-10-06");
});

test("all canonical public routes remain represented without indexing transient Workspace routes", () => {
  const sitemapPaths = buildPublicSitemap().map((entry) => new URL(entry.url).pathname);

  assert.deepEqual(sitemapPaths, [...PUBLIC_ROUTE_PATHS]);
  for (const path of [
    "/",
    "/pdf",
    "/pdf-tools",
    "/pdf/edit",
    "/pdf/organize",
    "/pdf/sign",
    "/pdf/compress",
    "/pdf/word-to-pdf",
    "/pdf/pdf-to-word",
    "/about",
    "/privacy",
    "/terms",
    "/contact",
  ]) {
    assert.ok(sitemapPaths.includes(path), `missing public sitemap route ${path}`);
  }

  assert.equal(sitemapPaths.includes("/pdf/add"), false);
  assert.equal(sitemapPaths.includes("/pdf/finish"), false);
});
