import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260712_003_public_tool_catalog.sql";
const newFiles = [
  migrationPath,
  "lib/public-catalog/types.ts",
  "lib/public-catalog/data.ts",
  "lib/public-catalog/fallback.ts",
  "components/public/PublicPdfToolsMenu.tsx",
  "components/public/PublicPdfToolsMenuClient.tsx",
  "app/pdf-tools/page.tsx",
  "app/pdf-tools/loading.tsx",
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

  const launcher = read("components/pdf/PdfToolLauncher.tsx");
  assert(launcher.includes("getPublicHomepageTools"), "Homepage launcher must use configured public homepage tools.");
  assert(launcher.includes("configuredTools.slice(0, 5)"), "Homepage launcher must use exactly five configurable slots.");
  assert(launcher.includes("All PDF Tools"), "Homepage launcher must include permanent All PDF Tools card.");
  assert(launcher.includes("/pdf-tools"), "All PDF Tools card must link to /pdf-tools.");

  const menu = read("components/public/PublicPdfToolsMenuClient.tsx");
  assert(menu.includes("PDF Tools"), "Navigation label must be PDF Tools.");
  assert(menu.includes("aria-expanded"), "Menu must expose aria-expanded.");
  assert(menu.includes("aria-controls"), "Menu must expose aria-controls.");
  assert(menu.includes("aria-haspopup"), "Menu must expose aria-haspopup.");
  assert(menu.includes("Escape"), "Menu must close on Escape.");

  const combined = newFiles.map(read).join("\n");
  assert(!/getSession\(/.test(combined), "New public catalog files must not use getSession().");
  assert(!/service_role/i.test(combined), "New public catalog files must not reference service_role.");
  assert(!/secret[_-]?key/i.test(combined), "New public catalog files must not reference secret keys.");
  assert(!/analytics_events\.insert|trackEvent|captureEvent|analytics\.track/i.test(combined), "Analytics tracking must not be added in this phase.");
  assert(!/\.insert\(|\.update\(|\.delete\(/.test(data), "Public catalog data layer must not write.");

  const packageJson = JSON.parse(read("package.json"));
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["react-dom"] === "^19.2.7", "React DOM version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");

  const processingEngines = execSync("git status --short -- lib/compressionProfiles.ts lib/compressionTarget.ts", {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert(!processingEngines, `PDF processing helper files must not be modified:\n${processingEngines}`);

  console.log("PASS public catalog migration exists");
  console.log("PASS public RPC functions and grants exist");
  console.log("PASS no direct anon table grants or public writes");
  console.log("PASS public catalog types, data layer, and fallback exist");
  console.log("PASS homepage has five configured slots plus permanent All PDF Tools");
  console.log("PASS /pdf-tools route exists");
  console.log("PASS PDF Tools menu accessibility markers exist");
  console.log("PASS no PDF processing engines, analytics tracking, or service-role usage changed");
  console.log("PASS protected package versions are unchanged");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Public catalog verification failed.");
  process.exit(1);
}
