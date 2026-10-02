import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("mobile Workspace keeps the locked four-destination navigation model", () => {
  const nav = read("components/pdf/workspace/WorkspaceMobileNav.tsx");

  assert.match(nav, /area: "edit", label: "Edit"/);
  assert.match(nav, /area: "pages", label: "Pages"/);
  assert.match(nav, />\s*More\s*</);
  assert.match(nav, />\s*Finish\s*</);

  assert.match(nav, /area: "sign", label: "Sign"/);
  assert.match(nav, /area: "enhance", label: "Add"/);
  assert.match(nav, /area: "optimize", label: "Compress"/);

  const directItems =
    nav.match(/const directItems:[\s\S]*?const moreItems:/)?.[0] ?? "";
  assert.doesNotMatch(directItems, /area: "sign"/);
  assert.doesNotMatch(directItems, /area: "enhance"/);
  assert.doesNotMatch(directItems, /area: "optimize"/);
});

test("mobile Workspace reserves safe-area space and keeps practical touch targets", () => {
  const nav = read("components/pdf/workspace/WorkspaceMobileNav.tsx");
  const workspace = read("components/pdf/workspace/ToolWorkspace.tsx");
  const layout = read("app/pdf/layout.tsx");

  assert.match(nav, /max-width: 1023px/);
  assert.match(nav, /lg:hidden/);
  assert.match(nav, /safe-area-inset-bottom/);
  assert.match(nav, /min-h-12/);
  assert.match(nav, /--workspace-mobile-nav-offset/);
  assert.match(workspace, /var\(--workspace-mobile-nav-offset, 0px\)/);
  assert.match(layout, /WorkspaceMobileNav/);
});

test("mobile Workspace navigation preserves connected-document routing and accessible More behavior", () => {
  const nav = read("components/pdf/workspace/WorkspaceMobileNav.tsx");

  assert.match(nav, /continueCurrent\(area\)/);
  assert.match(nav, /aria-label="PDF Workspace mobile navigation"/);
  assert.match(nav, /aria-expanded=\{moreOpen\}/);
  assert.match(nav, /aria-controls="workspace-mobile-more"/);
  assert.match(nav, /event\.key !== "Escape"/);
  assert.match(nav, /moreButtonRef\.current\?\.focus\(\)/);
});
