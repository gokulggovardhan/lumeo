import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260712003_public_tool_catalog.sql";
const newFiles = [
  migrationPath,
  "lib/public-catalog/types.ts",
  "lib/public-catalog/data.ts",
  "lib/public-catalog/fallback.ts",
  // PublicPdfToolsMenu.tsx was renamed to PublicPdfToolsMenuClient.tsx; no
  // separate loading.tsx exists under app/pdf-tools/ (removed since the
  // initial rollout -- page.tsx and error.tsx cover the route today).
  "components/public/PublicPdfToolsMenuClient.tsx",
  "components/tools/ToolsExplorer.tsx",
  "lib/tools/catalog.ts",
  "lib/tools/public-state.ts",
  "lib/tools/tool-status.ts",
  "lib/tools/tiles.ts",
  "lib/tools/discovery-search.ts",
  "lib/command-palette/index.ts",
  "app/pdf-tools/page.tsx",
  "app/pdf-tools/error.tsx",
  "docs/PUBLIC_TOOL_CATALOG.md",
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  for (const file of newFiles) {
    assert(exists(file), `Missing public catalog file: ${file}`);
  }

  const migration = read(migrationPath);
  assert(/^begin;/im.test(migration) && /^commit;/im.test(migration), "Migration 003 must be transactional.");
  assert(/create or replace function public\.get_public_pdf_catalog/i.test(migration), "Catalog RPC missing.");
  assert(/create or replace function public\.get_public_homepage_tools/i.test(migration), "Homepage RPC missing.");
  assert((migration.match(/set search_path = public/gi) ?? []).length >= 2, "Public RPC functions must lock search_path.");
  assert(/revoke all on function public\.get_public_pdf_catalog\(\) from public/i.test(migration), "Catalog RPC must revoke public execute before grants.");
  assert(/revoke all on function public\.get_public_homepage_tools\(\) from public/i.test(migration), "Homepage RPC must revoke public execute before grants.");
  assert(/grant execute on function public\.get_public_pdf_catalog\(\) to anon/i.test(migration), "Catalog RPC must grant anon execute.");
  assert(/grant execute on function public\.get_public_homepage_tools\(\) to anon/i.test(migration), "Homepage RPC must grant anon execute.");
  assert(/grant execute on function public\.get_public_pdf_catalog\(\) to authenticated/i.test(migration), "Catalog RPC must grant authenticated execute.");
  assert(/grant execute on function public\.get_public_homepage_tools\(\) to authenticated/i.test(migration), "Homepage RPC must grant authenticated execute.");
  assert(!/grant\s+select\s+on\s+table\s+public\./i.test(migration), "Migration must not grant direct public table SELECT.");
  assert(!/create policy[\s\S]*to anon/i.test(migration), "Migration must not create anon table policies.");
  assert(!/for\s+(insert|update|delete)/i.test(migration), "Migration must not add public write policies.");
  assert(!/slot_number\s*=\s*6|values\s*\(\s*6/i.test(migration), "Slot 6 must not be stored.");

  const types = read("lib/public-catalog/types.ts");
  assert(types.includes("PublicToolStatus"), "Public catalog types missing status type.");
  assert(!/\bany\b/.test(types), "Public catalog types must not use any.");

  const data = read("lib/public-catalog/data.ts");
  assert(data.includes('import "server-only"'), "Public catalog data module must be server-only.");
  assert(data.includes("get_public_pdf_catalog"), "Data module must call catalog RPC.");
  assert(data.includes("get_public_homepage_tools"), "Data module must call homepage RPC.");
  assert(data.includes("revalidate: 300"), "Public catalog data must use a 300-second cache.");
  assert(data.includes("lumeo-public-pdf-catalog") && data.includes("lumeo-public-homepage-tools"), "Public catalog cache keys must be stable.");
  assert(!/\.from\(\"(pdf_tools|homepage_tool_slots|tool_categories)/.test(data), "Public data layer must not query admin tables directly.");
  assert(!/service_role/i.test(data), "Public data layer must not reference service_role.");

  const fallback = read("lib/public-catalog/fallback.ts");
  assert(
    fallback.includes('const fallbackOrder = ["merge", "split", "compress", "jpg-to-pdf", "pdf-to-jpg"]'),
    "Fallback order must be Merge, Split, Compress, JPG to PDF, PDF to JPG.",
  );
  assert(fallback.includes("const localTools = pdfTools.map"), "Fallback catalog must include every live local registry tool.");
  assert(fallback.includes('tool.slug === "organize" ? "reorder"'), "Fallback catalog must map Organize to its Admin catalog slug.");
  for (const slug of ["crop", "page-numbers", "header-footer", "heic-to-jpeg"]) {
    assert(fallback.includes(`slug: "${slug}"`), `Fallback catalog must include the live ${slug} route.`);
  }

  // Homepage discovery is curated while the complete catalog remains available
  // through /pdf-tools and command search.
  const launcher = read("components/pdf/PdfToolLauncher.tsx");
  assert(launcher.includes("getPublicPdfCatalog") && launcher.includes("resolveLumeoTools"), "Homepage launcher must use the public PDF catalog and resolved Lumeo tools.");
  assert(launcher.includes("buildDiscoveryTiles(resolved)"), "Homepage launcher must use truthful resolved discovery state.");
  assert(launcher.includes("PRIMARY_TOOL_SLUGS") && launcher.includes("SECONDARY_TOOL_SLUGS"), "Homepage must keep an explicit primary/secondary hierarchy.");
  for (const slug of ["merge", "compress", "edit", "pdf-to-word", "word-to-pdf", "sign"]) {
    assert(launcher.includes(`"${slug}"`), `Homepage primary tool missing: ${slug}`);
  }
  assert(launcher.includes("available ? (") && launcher.includes("<article"), "Unavailable curated tools must be visible but non-actionable.");
  const footer = read("components/PublicFooter.tsx");
  assert(footer.includes("All PDF Tools"), "Public footer must include a permanent All PDF Tools link.");
  assert(footer.includes("/pdf-tools"), "All PDF Tools link must point to /pdf-tools.");

  const menu = read("components/public/PublicPdfToolsMenuClient.tsx");
  assert(menu.includes("PDF Tools"), "Navigation label must be PDF Tools.");
  assert(menu.includes("aria-expanded"), "Menu must expose aria-expanded.");
  assert(menu.includes("aria-controls"), "Menu must expose aria-controls.");
  assert(menu.includes("aria-haspopup"), "Menu must expose aria-haspopup.");
  assert(menu.includes("Escape"), "Menu must close on Escape.");

  const directory = read("app/pdf-tools/page.tsx");
  const explorer = read("components/tools/ToolsExplorer.tsx");
  const toolCatalog = read("lib/tools/catalog.ts");
  const resolver = read("lib/tools/resolve.ts");
  const tiles = read("lib/tools/tiles.ts");
  const commandIndex = read("lib/command-palette/index.ts");
  assert(directory.includes("buildDiscoveryTiles") && directory.includes("ToolsExplorer"), "Directory must render resolved direct-action tools.");
  assert(directory.includes("Find the right tool"), "Directory must use a clear complete-directory introduction.");
  assert(explorer.includes('type="search"') && explorer.includes('aria-live="polite"'), "Directory search and live result count are missing.");
  for (const filter of ["All tools", "Organize", "Edit", "Convert", "Sign & Fill", "Optimize", "Recognize", "Image Tools"]) {
    assert(explorer.includes(filter), `Directory filter missing: ${filter}`);
  }
  assert(explorer.includes("aria-pressed={category === filter.id}"), "Directory filters must expose pressed state.");
  assert(explorer.includes("href={tool.route}"), "Available directory cards must link directly to tool routes.");
  assert(explorer.includes("Temporarily unavailable") && !explorer.includes("Notify me"), "Unavailable tools must be explicit and non-misleading.");
  assert(explorer.includes("On device") && explorer.includes("Server-assisted"), "Directory processing labels are incomplete.");
  assert(toolCatalog.includes("searchAliases") && toolCatalog.includes('processing: "browser"'), "Canonical tool actions must own aliases and action-level processing overrides.");
  assert(tiles.includes("action.dbStatus") && tiles.includes("buildDiscoveryTiles"), "Discovery availability must derive from resolved catalog status.");
  const publicState = read("lib/tools/public-state.ts");
  const routeGate = read("lib/tools/tool-status.ts");
  assert(publicState.includes("resolveEffectivePublicToolState"), "Central effective public tool-state resolver is missing.");
  assert(resolver.includes("resolveEffectivePublicToolState(dbTool)"), "Discovery must use the central effective tool-state resolver.");
  assert(routeGate.includes("resolveEffectivePublicToolState(dbTool)"), "Direct routes must use the central effective tool-state resolver.");
  assert(!routeGate.includes("if (!dbTool) return { blocked: false }"), "Missing Admin catalog rows must not fail open on direct routes.");
  assert(commandIndex.includes("...tile.aliases") && commandIndex.includes("...tile.capabilities"), "Command palette must reuse canonical discovery aliases.");
  assert(!commandIndex.includes("const TOOL_ALIASES"), "Command palette must not maintain a second tool alias index.");
  assert(!/pdfjs-dist|pdf-lib|heic-decode|JSZip/.test([directory, explorer, tiles].join("\n")), "Directory must not import heavy processing engines.");

  const combined = newFiles.map(read).join("\n");
  assert(!/getSession\(/.test(combined), "New public catalog files must not use getSession().");
  assert(!/service_role/i.test(combined), "New public catalog files must not reference service_role.");
  assert(!/secret[_-]?key/i.test(combined), "New public catalog files must not reference secret keys.");
  assert(!/analytics_events\.insert|trackEvent|captureEvent|analytics\.track/i.test(combined), "Analytics tracking must not be added in this phase.");
  assert(!/\.insert\(|\.update\(|\.delete\(/.test(data), "Public catalog data layer must not write.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.dependencies.next === "^16.3.0", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.8", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.8", "React DOM version changed unexpectedly.");

  const processingEngines = execSync("git status --short -- lib/compressionProfiles.ts lib/compressionTarget.ts", {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert(!processingEngines, `PDF processing helper files must not be modified:\n${processingEngines}`);

  console.log("PASS public catalog migration exists");
  console.log("PASS public RPC functions and grants exist");
  console.log("PASS no direct anon table grants or public writes");
  console.log("PASS public catalog types, data layer, and fallback exist");
  console.log("PASS homepage launcher renders a curated primary/secondary hierarchy");
  console.log("PASS /pdf-tools route exists");
  console.log("PASS PDF Tools menu accessibility markers exist");
  console.log("PASS no PDF processing engines, analytics tracking, or service-role usage changed");
  console.log("PASS protected package versions are unchanged");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public catalog verification failed.");
  process.exit(1);
}
