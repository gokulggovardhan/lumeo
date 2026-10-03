import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("/pdf is a real upload-once Workspace entry, not a redirect", () => {
  const page = read("app/pdf/page.tsx");
  const start = read("components/pdf/workspace/WorkspaceStart.tsx");

  assert.doesNotMatch(page, /redirect\(/);
  assert.match(page, /WorkspaceStart/);
  assert.match(page, /canonical:\s*"\/pdf"/);

  assert.match(start, /Upload one PDF once/);
  assert.match(start, /edit it/);
  assert.match(start, /organize pages/);
  assert.match(start, /sign/);
  assert.match(start, /watermarks or page numbers/);
  assert.match(start, /compress/);
  assert.match(start, /download the finished PDF once/);

  assert.match(start, /startDocument/);
  assert.match(start, /continueCurrent/);
  assert.match(start, /multiple=\{false\}/);
  assert.match(start, /checkPdfFileSize/);
  assert.match(start, /hasPdfMagicBytes/);
  assert.match(start, /checkPdfPageCount/);
  assert.match(start, /PDFDocument\.load/);
});

test("Workspace is visibly discoverable from the homepage and PDF Tools menu", () => {
  const home = read("app/page.tsx");
  const menu = read("components/public/PublicPdfToolsMenuClient.tsx");

  assert.match(home, /href="\/pdf"/);
  assert.match(home, /Start PDF Workspace/);
  assert.match(home, /Upload once · Use multiple tools · Download once/);

  assert.match(menu, /href="\/pdf"/);
  assert.match(menu, /Start PDF Workspace/);
  assert.match(menu, /Upload once · use multiple tools · download once/);
});

test("mobile Workspace current state follows the actual route", () => {
  const nav = read("components/pdf/workspace/WorkspaceMobileNav.tsx");

  assert.match(nav, /function routeIsActive/);
  assert.match(nav, /pathname === routeForArea\(area\)/);
  assert.match(nav, /routeIsActive\("export"\) \|\| activeArea === "export"/);
  assert.match(nav, /moreItems\.some\(\(item\) => routeIsActive\(item\.area\)\)/);
});

test("release browser proof starts from the visible Workspace entry", () => {
  const e2e = read("e2e/workspace-mobile.spec.ts");
  assert.match(e2e, /page\.goto\("\/pdf"/);
  assert.match(e2e, /heading", \{ name: "PDF Workspace", exact: true \}/);
  assert.match(e2e, /getByRole\("button", \{ name: \/\^Pages\//);
  assert.match(e2e, /Download PDF/);
});
