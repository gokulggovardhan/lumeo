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
