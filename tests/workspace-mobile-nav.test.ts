import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("mobile Workspace exposes the four primary destinations", () => {
  const nav = read(
    "components/pdf/workspace/WorkspaceMobileNav.tsx",
  );

  for (const label of ["Edit", "Pages", "More", "Finish"]) {
    assert.match(nav, new RegExp(">" + label + "<"));
  }
  for (const label of ["Sign", "Add", "Compress"]) {
    assert.match(nav, new RegExp('label: "' + label + '"'));
  }

  assert.match(nav, /max-width: 1023px/);
  assert.match(nav, /lg:hidden/);
  assert.match(nav, /safe-area-inset-bottom/);
  assert.match(nav, /continueCurrent\(area\)/);
  assert.match(nav, /aria-label="PDF Workspace mobile navigation"/);
  assert.match(nav, /aria-expanded=\{moreOpen\}/);
});

test("mobile navigation reserves space for sticky tool actions", () => {
  const nav = read(
    "components/pdf/workspace/WorkspaceMobileNav.tsx",
  );
  const workspace = read(
    "components/pdf/workspace/ToolWorkspace.tsx",
  );
  const layout = read("app/pdf/layout.tsx");

  assert.match(nav, /--workspace-mobile-nav-offset/);
  assert.match(workspace, /var\(--workspace-mobile-nav-offset, 0px\)/);
  assert.match(layout, /WorkspaceMobileNav/);
});

test("mobile Workspace keeps secondary tools behind More", () => {
  const nav = read(
    "components/pdf/workspace/WorkspaceMobileNav.tsx",
  );

  const direct = nav.match(/directItems:[\s\S]*?moreItems:/)?.[0] ?? "";
  assert.match(direct, /area: "edit"/);
  assert.match(direct, /area: "pages"/);
  assert.doesNotMatch(direct, /area: "sign"/);
  assert.doesNotMatch(direct, /area: "enhance"/);
  assert.doesNotMatch(direct, /area: "optimize"/);
});
