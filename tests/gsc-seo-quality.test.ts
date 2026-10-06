import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const toolPages = [
  ["app/heic-to-jpeg/page.tsx", "/heic-to-jpeg"],
  ["app/pdf/merge/page.tsx", "/pdf/merge"],
  ["app/pdf/split/page.tsx", "/pdf/split"],
  ["app/pdf/compress/page.tsx", "/pdf/compress"],
  ["app/pdf/jpg-to-pdf/page.tsx", "/pdf/jpg-to-pdf"],
  ["app/pdf/pdf-to-jpg/page.tsx", "/pdf/pdf-to-jpg"],
  ["app/pdf/sign/page.tsx", "/pdf/sign"],
  ["app/pdf/organize/page.tsx", "/pdf/organize"],
  ["app/pdf/extract-text/page.tsx", "/pdf/extract-text"],
  ["app/pdf/edit/page.tsx", "/pdf/edit"],
  ["app/pdf/watermark/page.tsx", "/pdf/watermark"],
  ["app/pdf/crop/page.tsx", "/pdf/crop"],
  ["app/pdf/page-numbers/page.tsx", "/pdf/page-numbers"],
  ["app/pdf/header-footer/page.tsx", "/pdf/header-footer"],
  ["app/pdf/word-to-pdf/page.tsx", "/pdf/word-to-pdf"],
  ["app/pdf/pdf-to-word/page.tsx", "/pdf/pdf-to-word"],
  ["app/pdf/html-to-pdf/page.tsx", "/pdf/html-to-pdf"],
] as const;

test("GSC-confirmed thin public tool pages include useful visible guidance", () => {
  for (const [path, route] of toolPages) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /ToolSeoContent/);
    assert.ok(
      source.includes(`<ToolSeoContent route="${route}" />`),
      `${route} must render its route-specific SEO content`,
    );
  }
});

test("PDF Workspace has an absolute title and structured data", () => {
  const source = readFileSync("app/pdf/page.tsx", "utf8");
  assert.match(source, /title:\s*\{\s*absolute:/);
  assert.match(source, /buildSoftwareApplicationSchema/);
  assert.match(source, /buildBreadcrumbSchema/);
  assert.match(source, /JSON\.stringify\(workspaceSchema\)/);
  assert.match(source, /JSON\.stringify\(workspaceBreadcrumbSchema\)/);
});

test("SEO content is informational and does not claim remote document storage", () => {
  const source = readFileSync("components/pdf/ToolSeoContent.tsx", "utf8");
  assert.doesNotMatch(
    source,
    /\b(?:your\s+)?(?:files?|documents?|pdfs?|photos?|images?)\s+(?:are|is)\s+(?:uploaded|sent)\s+to\s+(?:our|a)\s+server\b/i,
  );
  assert.match(source, /browser/i);
  assert.match(
    source,
    /original file remains unchanged|original file on your device is unchanged|source file on your device is unchanged/i,
  );
});

test("major search-intent pages include concise how-to guidance and contextual tool links", () => {
  const source = readFileSync("components/pdf/ToolSeoContent.tsx", "utf8");
  assert.match(source, /How to use this tool/);
  assert.match(source, /aria-label="Related PDF tools"/);
  assert.ok((source.match(/steps:\s*\[/g) ?? []).length >= 8);
  assert.ok((source.match(/relatedTools:\s*\[/g) ?? []).length >= 8);

  for (const href of [
    "/pdf/word-to-pdf",
    "/pdf/pdf-to-word",
    "/pdf/jpg-to-pdf",
    "/pdf/pdf-to-jpg",
    "/pdf/edit",
    "/pdf/merge",
    "/pdf/split",
    "/pdf/compress",
  ]) {
    assert.ok(source.includes(`href: "${href}"`), `missing contextual link to ${href}`);
  }
});

test("Edit PDF aligns editor search intent without unsupported best-editor claims", () => {
  const pageSource = readFileSync("app/pdf/edit/page.tsx", "utf8");
  const seoSource = readFileSync("components/pdf/ToolSeoContent.tsx", "utf8");
  assert.match(pageSource, /PDF Editor Online - Edit PDF Privately \| Lumeo/);
  assert.match(pageSource, /title="Edit PDF"/);
  assert.match(seoSource, /Online PDF editor for text and annotations/);
  assert.doesNotMatch(`${pageSource}\n${seoSource}`, /best pdf editor/i);
});

test("public footer links directly to the core PDF search-intent pages", () => {
  const source = readFileSync("components/PublicFooter.tsx", "utf8");
  for (const href of [
    "/pdf/word-to-pdf",
    "/pdf/pdf-to-word",
    "/pdf/jpg-to-pdf",
    "/pdf/merge",
    "/pdf/split",
    "/pdf/compress",
    "/pdf/edit",
    "/pdf-tools",
  ]) {
    assert.ok(source.includes(`href: "${href}"`), `footer missing ${href}`);
  }
});

