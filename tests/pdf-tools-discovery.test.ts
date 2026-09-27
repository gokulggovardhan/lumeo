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

test("public category mapping keeps specialist tools in clear homes", () => {
  const catalog = readFileSync("lib/tools/catalog.ts", "utf8");
  const tiles = readFileSync("lib/tools/tiles.ts", "utf8");

  assert.match(catalog, /edit: "Edit"/);
  assert.match(catalog, /"sign-fill": "Sign & Fill"/);
  assert.match(catalog, /recognize: "Recognize"/);
  assert.match(catalog, /"image-tools": "Image Tools"/);

  assert.match(tiles, /seal: "sign-fill"/);
  assert.match(tiles, /"extract-text": "recognize"/);
  assert.match(tiles, /"heic-to-jpeg": "image-tools"/);
});

test("directory uses compact combined filters, live counts, and shared truthful cards", () => {
  const explorer = readFileSync("components/tools/ToolsExplorer.tsx", "utf8");
  const card = readFileSync("components/tools/DiscoveryToolCard.tsx", "utf8");

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
    assert.match(explorer, new RegExp(label));
  }

  assert.match(explorer, /aria-pressed={category === filter.id}/);
  assert.match(explorer, /aria-live="polite"/);
  assert.match(explorer, /DiscoveryToolCard/);
  assert.match(card, /href={tool.route}/);
  assert.match(card, /Temporarily unavailable/);
  assert.doesNotMatch(card, /Notify me/);
  assert.match(card, /On device/);
  assert.match(explorer, /Current live tools are browser-based/);
  assert.match(explorer, /xl:grid-cols-4/);
});

test("slash and Escape keyboard contracts are hydration-safe", () => {
  const source = readFileSync("components/tools/ToolsExplorer.tsx", "utf8");
  assert.ok(source.includes('event.key === "/"'));
  assert.ok(source.includes('event.key === "Escape"'));
  assert.ok(source.includes("inputRef.current?.focus()"));
  assert.ok(source.includes('setQuery("")'));
  assert.ok(source.includes("data-search-shortcut-ready"));
  assert.ok(source.includes('window.addEventListener("keydown", handleKeyDown)'));
});

test("homepage and directory share the same compact tool-card implementation", () => {
  const launcher = readFileSync("components/pdf/PdfToolLauncher.tsx", "utf8");
  const explorer = readFileSync("components/tools/ToolsExplorer.tsx", "utf8");
  const card = readFileSync("components/tools/DiscoveryToolCard.tsx", "utf8");

  assert.ok(launcher.includes("DiscoveryToolCard"));
  assert.ok(explorer.includes("DiscoveryToolCard"));
  assert.ok(card.includes("data-tool-card"));
  assert.ok(card.includes("min-h-[9.5rem]"));
  assert.ok(card.includes("min-h-[10.25rem]"));
});

test("command palette reuses catalog aliases and traps focus", () => {
  const index = readFileSync("lib/command-palette/index.ts", "utf8");
  const dialog = readFileSync("components/CommandPaletteDialog.tsx", "utf8");
  assert.ok(index.includes("...tile.aliases"));
  assert.ok(index.includes("...tile.capabilities"));
  assert.doesNotMatch(index, /const TOOL_ALIASES/);
  assert.ok(dialog.includes('event.key !== "Tab"'));
  assert.ok(dialog.includes("onKeyDown={handleDialogKeyDown}"));
  assert.ok(dialog.includes('aria-modal="true"'));
});

test("directory keeps heavy PDF engines out of its component graph", () => {
  const sources = [
    readFileSync("app/pdf-tools/page.tsx", "utf8"),
    readFileSync("components/tools/ToolsExplorer.tsx", "utf8"),
    readFileSync("components/tools/DiscoveryToolCard.tsx", "utf8"),
    readFileSync("lib/tools/tiles.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /pdfjs-dist|pdf-lib|heic-decode|JSZip/);
});

test("resolved discovery availability comes from the shared public catalog status", () => {
  const resolver = readFileSync("lib/tools/resolve.ts", "utf8");
  const tiles = readFileSync("lib/tools/tiles.ts", "utf8");
  assert.ok(resolver.includes("resolveEffectivePublicToolState(dbTool)"));
  assert.ok(resolver.includes("dbStatus: state.status"));
  assert.ok(tiles.includes('action.dbStatus === "maintenance"'));
  assert.ok(tiles.includes('action.dbStatus === "coming_soon"'));
  assert.ok(tiles.includes('action.dbStatus === "hidden"'));
});
