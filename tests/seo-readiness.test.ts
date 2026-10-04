import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PUBLIC_OPEN_GRAPH_IMAGE,
  PUBLIC_TWITTER_IMAGE,
  withPublicSocialImages,
} from "../lib/public-site/metadata.ts";
import { inspectSeoHtml } from "../scripts/verify-production-seo.mjs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("public social metadata fills missing preview images without replacing route-specific values", () => {
  const fallback = withPublicSocialImages({
    title: "Example",
    description: "Example description",
    openGraph: {
      title: "Example",
      description: "Example description",
      url: "https://lumeo.in/example",
      type: "website",
    },
  });

  assert.deepEqual(fallback.openGraph?.images, [PUBLIC_OPEN_GRAPH_IMAGE]);
  assert.equal(fallback.twitter?.card, "summary_large_image");
  assert.deepEqual(fallback.twitter?.images, [PUBLIC_TWITTER_IMAGE]);

  const custom = withPublicSocialImages({
    openGraph: {
      title: "Custom",
      description: "Custom description",
      type: "website",
      images: ["https://lumeo.in/custom-og.png"],
    },
    twitter: {
      card: "summary_large_image",
      images: ["https://lumeo.in/custom-twitter.png"],
    },
  });

  assert.deepEqual(custom.openGraph?.images, ["https://lumeo.in/custom-og.png"]);
  assert.deepEqual(custom.twitter?.images, ["https://lumeo.in/custom-twitter.png"]);
});

test("Workspace entry participates in the same live SEO override system as the public registry", () => {
  const workspace = read("app/pdf/page.tsx");
  assert.match(workspace, /withSeoOverride\("\/pdf"/);
  assert.match(workspace, /export async function generateMetadata/);
  assert.doesNotMatch(workspace, /export const metadata/);
});

test("legacy branded category pages stay crawlable for links but are excluded from search results", () => {
  const category = read("app/pdf-tools/[category]/page.tsx");
  assert.match(category, /index:\s*false/);
  assert.match(category, /follow:\s*true/);
  assert.match(category, /const metadata = await withSeoOverride/);
});

test("HEIC converter has SoftwareApplication and breadcrumb structured data", () => {
  const heic = read("app/heic-to-jpeg/page.tsx");
  assert.match(heic, /buildSoftwareApplicationSchema/);
  assert.match(heic, /buildBreadcrumbSchema/);
  assert.match(heic, /application\/ld\+json/);
});

test("production health runs crawler-readiness checks only after exact revision verification", () => {
  const workflow = read(".github/workflows/production-health.yml");
  const revision = workflow.indexOf("Verify deployed revision and Admin boundary");
  const seo = workflow.indexOf("Verify crawler SEO readiness");
  assert.notEqual(revision, -1);
  assert.notEqual(seo, -1);
  assert.ok(revision < seo);
  assert.match(workflow, /npm run verify:production-seo/);
});

test("crawler inspector accepts complete indexable metadata and rejects canonical or noindex drift", () => {
  const html = `<!doctype html>
    <html>
      <head>
        <title>Merge PDF | Lumeo</title>
        <meta name="description" content="Merge PDFs privately.">
        <link rel="canonical" href="https://lumeo.in/pdf/merge">
        <meta property="og:title" content="Merge PDF">
        <meta property="og:description" content="Merge PDFs privately.">
        <meta property="og:image" content="https://lumeo.in/opengraph-image">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:image" content="https://lumeo.in/twitter-image">
      </head>
    </html>`;

  assert.equal(
    inspectSeoHtml(html, "https://lumeo.in/pdf/merge").canonical,
    "https://lumeo.in/pdf/merge",
  );

  assert.throws(
    () =>
      inspectSeoHtml(
        html.replace(
          "https://lumeo.in/pdf/merge",
          "https://lumeo.in/pdf/split",
        ),
        "https://lumeo.in/pdf/merge",
      ),
    /canonical mismatch/,
  );

  assert.throws(
    () =>
      inspectSeoHtml(
        html.replace(
          '<meta name="description" content="Merge PDFs privately.">',
          '<meta name="description" content="Merge PDFs privately."><meta name="robots" content="noindex,follow">',
        ),
        "https://lumeo.in/pdf/merge",
      ),
    /marked noindex/,
  );
});
