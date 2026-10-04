import { pathToFileURL } from "node:url";

function fail(message) {
  throw new Error(message);
}

function normalizeUrl(value) {
  const url = new URL(value);
  if (url.pathname === "/") return `${url.origin}/`;
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

const XML_ENTITY = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(value) {
  return value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_match, entity) => XML_ENTITY[entity],
  );
}

function attributes(tag) {
  const result = new Map();
  const pattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = pattern.exec(tag))) {
    result.set(match[1].toLowerCase(), match[3]);
  }
  return result;
}

function findTagByAttribute(html, tagName, attribute, value) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  for (const tag of html.match(pattern) ?? []) {
    const attrs = attributes(tag);
    if ((attrs.get(attribute) ?? "").toLowerCase() === value.toLowerCase()) {
      return attrs;
    }
  }
  return null;
}

function findMeta(html, key, value) {
  return (
    findTagByAttribute(html, "meta", key, value)?.get("content")?.trim() ?? ""
  );
}

function findCanonical(html) {
  const pattern = /<link\b[^>]*>/gi;
  for (const tag of html.match(pattern) ?? []) {
    const attrs = attributes(tag);
    const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) return attrs.get("href")?.trim() ?? "";
  }
  return "";
}

function findTitle(html) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
}

async function fetch200(fetchImpl, url) {
  const response = await fetchImpl(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status !== 200) {
    fail(`${new URL(url).pathname} returned HTTP ${response.status}`);
  }
  return response;
}

export function inspectSeoHtml(html, expectedUrl) {
  const canonical = findCanonical(html);
  const title = findTitle(html);
  const description = findMeta(html, "name", "description");
  const robots = findMeta(html, "name", "robots").toLowerCase();
  const ogTitle = findMeta(html, "property", "og:title");
  const ogDescription = findMeta(html, "property", "og:description");
  const ogImage = findMeta(html, "property", "og:image");
  const twitterCard = findMeta(html, "name", "twitter:card");
  const twitterImage = findMeta(html, "name", "twitter:image");

  if (!title) fail(`${new URL(expectedUrl).pathname} is missing a title`);
  if (!description) fail(`${new URL(expectedUrl).pathname} is missing a meta description`);
  if (!canonical) fail(`${new URL(expectedUrl).pathname} is missing a canonical URL`);
  if (normalizeUrl(canonical) !== normalizeUrl(expectedUrl)) {
    fail(
      `${new URL(expectedUrl).pathname} canonical mismatch: expected ${normalizeUrl(expectedUrl)}, observed ${canonical}`,
    );
  }
  if (/\bnoindex\b/.test(robots)) {
    fail(`${new URL(expectedUrl).pathname} is in the sitemap but marked noindex`);
  }
  if (!ogTitle || !ogDescription || !ogImage) {
    fail(`${new URL(expectedUrl).pathname} is missing complete Open Graph metadata`);
  }
  if (!twitterCard || !twitterImage) {
    fail(`${new URL(expectedUrl).pathname} is missing complete Twitter card metadata`);
  }

  return { canonical: normalizeUrl(canonical), title, description };
}

export async function verifyProductionSeo({
  baseUrl = "https://lumeo.in",
  fetchImpl = fetch,
} = {}) {
  const origin = new URL(baseUrl);

  const robotsResponse = await fetch200(fetchImpl, new URL("/robots.txt", origin));
  const robots = await robotsResponse.text();
  if (/^\s*Disallow:\s*\/\s*$/im.test(robots)) {
    fail("robots.txt contains a blanket Disallow: /");
  }
  if (!robots.includes(`Sitemap: ${origin.origin}/sitemap.xml`)) {
    fail("robots.txt does not advertise the canonical sitemap");
  }

  const sitemapResponse = await fetch200(fetchImpl, new URL("/sitemap.xml", origin));
  const sitemap = await sitemapResponse.text();
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
    decodeXml(match[1].trim()),
  );

  if (urls.length < 20) {
    fail(`sitemap contains only ${urls.length} public URLs`);
  }
  if (new Set(urls).size !== urls.length) {
    fail("sitemap contains duplicate URLs");
  }

  const titles = new Map();
  for (const url of urls) {
    const parsed = new URL(url);
    if (parsed.origin !== origin.origin) {
      fail(`sitemap contains an off-origin URL: ${url}`);
    }

    const response = await fetch200(fetchImpl, parsed);
    const html = await response.text();
    const result = inspectSeoHtml(html, url);

    const previous = titles.get(result.title);
    if (previous) {
      fail(`duplicate page title "${result.title}" on ${previous} and ${parsed.pathname}`);
    }
    titles.set(result.title, parsed.pathname);
  }

  return {
    routes: urls.length,
    uniqueTitles: titles.size,
  };
}

async function main() {
  const result = await verifyProductionSeo({
    baseUrl: process.env.LUMEO_PRODUCTION_URL || "https://lumeo.in",
  });

  console.log(`PASS robots.txt and sitemap discovery are crawler-ready`);
  console.log(`PASS ${result.routes} sitemap routes have exact canonicals, indexable metadata, social previews, and unique titles`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
