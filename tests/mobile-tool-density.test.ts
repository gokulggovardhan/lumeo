import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("mobile homepage prioritizes PDF tools before supporting trust content", () => {
  const css = read("app/home.module.css");
  const page = read("app/page.tsx");

  assert.match(
    css,
    /grid-template-areas:\s*"hero"\s*"tools"\s*"trust"/,
  );
  assert.match(
    css,
    /@media \(min-width: 900px\)[\s\S]*grid-template-areas:\s*"hero trust"\s*"tools tools"/,
  );
  assert.match(page, /className=\{styles\.heroTools\}/);
  assert.match(page, /<PdfToolLauncher allToolsLabel="View all tools" \/>/);
  assert.match(page, /aria-label="Lumeo trust principles"/);
});

test("tool directory keeps at least two compact cards per mobile row", () => {
  const explorer = read("components/tools/ToolsExplorer.tsx");

  assert.match(
    explorer,
    /grid grid-cols-2 gap-2\.5 sm:grid-cols-3 lg:grid-cols-4/,
  );
  assert.match(explorer, /min-h-\[8rem\]/);
  assert.match(explorer, /h-9 w-9/);
  assert.match(explorer, /sm:inline-flex/);
});

test("secondary tool switchers use compact responsive grids", () => {
  const category = read("components/tools/ToolCategoryDetail.tsx");
  const add = read("components/pdf/workspace/AddWorkspaceEntry.tsx");

  assert.match(
    category,
    /grid-cols-2 gap-2\.5 max-\[360px\]:grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/,
  );
  assert.match(category, /min-h-\[6rem\]/);
  assert.match(
    add,
    /grid-cols-2 gap-2\.5 max-\[340px\]:grid-cols-1 sm:grid-cols-3/,
  );
  assert.match(add, /min-h-\[4\.75rem\]/);
});
