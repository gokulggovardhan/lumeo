import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

test("mobile homepage prioritizes PDF tools before supporting trust content", () => {
  const page = read("app/page.tsx");

  assert.doesNotMatch(page, /home\.module\.css|styles\./);
  assert.match(
    page,
    /<header className="order-1 min-\[900px\]:col-start-1 min-\[900px\]:row-start-1">/,
  );
  assert.match(
    page,
    /<div className="order-2 min-w-0 min-\[900px\]:order-3 min-\[900px\]:col-span-2 min-\[900px\]:row-start-2">[\s\S]*<PdfToolLauncher allToolsLabel="View all tools" \/>/,
  );
  assert.match(
    page,
    /<aside className="order-3[\s\S]*min-\[900px\]:order-2[\s\S]*aria-label="Lumeo trust principles">/,
  );
  assert.match(
    page,
    /sm:text-\[clamp\(2\.25rem,4\.6vw,3\.75rem\)\]/,
  );
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
