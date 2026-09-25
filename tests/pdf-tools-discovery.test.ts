import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toolMatchesQuery } from "../lib/tools/discovery-search.ts";
import type { Tile } from "../lib/tools/tiles.ts";

function tile(overrides: Partial<Tile> = {}): Tile {
  return {
    slug: "reorder",
    route: "/pdf/organize",
    label: "Organize PDF",
    description: "Reorder, rotate, duplicate, or remove PDF pages.",
    glyph: "compose",
    accent: "sage",
    category: "organize",
    categoryLabel: "Organize",
    brandedCategory: "Compose",
    processing: "browser",
    availability: "active",
    maintenanceMessage: null,
    aliases: ["reorder", "rotate", "remove-pages", "duplicate-page"],
    capabilities: ["Page Re-Order", "Rotate pages", "Remove pages", "Duplicate page"],
    popular: false,
    ...overrides,
  };
}

test("discovery search matches names, descriptions, categories, aliases, and bundled capabilities", () => {
  const organize = tile();
  assert.equal(toolMatchesQuery(organize, "ORGANIZE"), true);
  assert.equal(toolMatchesQuery(organize, "rotate"), true);
  assert.equal(toolMatchesQuery(organize, "remove pages"), true);
  assert.equal(toolMatchesQuery(organize, "compose"), true);
  assert.equal(toolMatchesQuery(organize, "unrelated"), false);
});

test("discovery search exposes signature, image, and text vocabulary", () => {
  assert.equal(toolMatchesQuery(tile({ label: "Sign PDF", aliases: ["signature", "initials"] }), "signature"), true);
  assert.equal(toolMatchesQuery(tile({ label: "JPG to PDF", aliases: ["image", "photo"] }), "image"), true);
  assert.equal(toolMatchesQuery(tile({ label: "Edit PDF", aliases: ["text", "whiteout"] }), "text"), true);
  assert.equal(toolMatchesQuery(tile({ label: "Extract Text", aliases: ["copy text"] }), "text"), true);
});

test("directory uses direct links, combined filters, live counts, and truthful availability", () => {
  const source = readFileSync("components/tools/ToolsExplorer.tsx", "utf8");
  for (const label of [
    "All tools",
    "Organize",
    "Edit",
    "Convert",
    "Sign & Fill",
    "Optimize",
    "Recognize",
    "Image Tools",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /aria-pressed=\{category === filter\.id\}/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /href=\{tool\.route\}/);
  assert.match(source, /Temporarily unavailable/);
  assert.doesNotMatch(source, /Notify me/);
  assert.match(source, /On device/);
  assert.match(source, /Current live tools are browser-based/);
});

test("slash and Escape keyboard contracts are explicit", () => {
  const source = readFileSync("components/tools/ToolsExplorer.tsx", "utf8");
  assert.match(source, /event\.key === "\/"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /inputRef\.current\?\.focus\(\)/);
  assert.match(source, /setQuery\(""\)/);
});

test("command palette reuses catalog aliases and traps focus", () => {
  const index = readFileSync("lib/command-palette/index.ts", "utf8");
  const dialog = readFileSync("components/CommandPaletteDialog.tsx", "utf8");
  assert.match(index, /\.\.\.tile\.aliases/);
  assert.match(index, /\.\.\.tile\.capabilities/);
  assert.doesNotMatch(index, /const TOOL_ALIASES/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /onKeyDown=\{handleDialogKeyDown\}/);
  assert.match(dialog, /aria-modal="true"/);
});

test("directory keeps heavy PDF engines out of its component graph", () => {
  const sources = [
    readFileSync("app/pdf-tools/page.tsx", "utf8"),
    readFileSync("components/tools/ToolsExplorer.tsx", "utf8"),
    readFileSync("lib/tools/tiles.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /pdfjs-dist|pdf-lib|heic-decode|JSZip/);
});

test("resolved discovery availability comes from the shared public catalog status", () => {
  const resolver = readFileSync("lib/tools/resolve.ts", "utf8");
  const tiles = readFileSync("lib/tools/tiles.ts", "utf8");
  assert.match(resolver, /resolveEffectivePublicToolState\(dbTool\)/);
  assert.match(resolver, /dbStatus: state\.status/);
  assert.match(tiles, /action\.dbStatus === "maintenance"/);
  assert.match(tiles, /action\.dbStatus === "coming_soon"/);
  assert.match(tiles, /action\.dbStatus === "hidden"/);
});
