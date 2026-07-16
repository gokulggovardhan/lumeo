import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return existsSync(join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(read("package.json"));
const globals = read("app/globals.css");
const homepage = read("app/page.tsx");
const pdfTools = read("app/pdf-tools/page.tsx");
const mergePage = read("app/pdf/merge/page.tsx");
const splitPage = read("app/pdf/split/page.tsx");
const compressPage = read("app/pdf/compress/page.tsx");
const publicChrome = read("components/PublicPdfChrome.tsx");
const publicFooter = read("components/PublicFooter.tsx");
const infoPage = read("components/InfoPage.tsx");
const launcher = read("components/pdf/PdfToolLauncher.tsx");
const placeholder = read("components/pdf/PdfToolPlaceholder.tsx");
const toolsMenu = read("components/public/PublicPdfToolsMenuClient.tsx");
const sidebar = read("components/admin/ControlCenterSidebar.tsx");
const mobileNav = read("components/admin/ControlCenterMobileNav.tsx");
const navigation = read("lib/admin/navigation.ts");
const guide = read("app/admin/(protected)/guide/page.tsx");
const designSystem = read("app/admin/(protected)/design-system/page.tsx");

const adminPrimitives = [
  "components/admin/AdminPageHeader.tsx",
  "components/admin/AdminSectionCard.tsx",
  "components/admin/AdminMetricCard.tsx",
  "components/admin/AdminStatusBadge.tsx",
  "components/admin/AdminDataTable.tsx",
  "components/admin/AdminFormField.tsx",
  "components/admin/AdminSubmitButton.tsx",
  "components/admin/AdminEmptyState.tsx",
].map(read).join("\n");

const rolloutSources = [
  homepage,
  pdfTools,
  publicChrome,
  publicFooter,
  infoPage,
  launcher,
  placeholder,
  toolsMenu,
  sidebar,
  mobileNav,
  guide,
  designSystem,
  adminPrimitives,
].join("\n");

try {
  assert(packageJson.scripts["verify:aura-rollout"] === "node scripts/verify-lumeo-aura-rollout.mjs", "verify:aura-rollout script is missing.");
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.110.2", "Supabase JS version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");

  assert(globals.includes("--surface-canvas") && globals.includes("--lumeo-aura-400"), "Aura base tokens are missing.");
  for (const token of ["--text-primary", "--text-secondary", "--text-muted", "--text-inverse", "--text-accent"]) {
    assert(globals.includes(token), `Missing semantic text token: ${token}`);
  }
  assert(globals.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion support is missing.");
  assert(globals.includes(".aura-live-tool"), "Live PDF tool visual correction layer is missing.");
  assert(!/--surface-canvas:\s*#fff/i.test(globals), "Public canvas must not be plain white.");

  const publicMarkers = [
    "aura-home",
    "aura-home-workspace",
    "aura-public-nav",
    "aura-public-footer",
    "aura-info-page",
    "L2ToolCard",
    "aura-directory-section",
    "Coming soon",
  ];
  for (const marker of publicMarkers) {
    assert(rolloutSources.includes(marker), `Missing public Aura rollout marker: ${marker}`);
  }

  assert(homepage.includes("Work with PDFs beautifully."), "Homepage Run 2 heading is missing.");
  assert(homepage.includes("Private, fast, browser-first."), "Homepage compact trust copy is missing.");
  assert(homepage.includes("text-[var(--text-primary)]"), "Homepage must use high-contrast primary text token.");
  assert(!homepage.includes("bg-[rgba(255,253,247"), "Homepage must not use a white public canvas.");
  assert(launcher.includes("getPublicHomepageTools"), "Tool launcher must continue deriving cards from the public catalog helper.");
  assert(pdfTools.includes("getPublicCatalog") || pdfTools.includes("PublicCatalog"), "PDF tools directory must remain catalog-backed.");
  assert(!pdfTools.includes("rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-5"), "PDF tools directory must not use giant nested category panels.");
  assert(toolsMenu.includes("PublicPdfToolsMenuClient"), "PDF tools menu component appears missing.");
  assert(!publicFooter.includes("bg-[rgba(255,253,247"), "Public footer must not be a white canvas block.");
  assert(!publicChrome.includes("bg-[rgba(255,253,247"), "Public chrome must not be a flat pale strip.");
  assert(infoPage.includes("text-[var(--text-primary)]"), "Info pages must use semantic high-contrast text.");
  assert(read("app/guides/page.tsx").includes("text-[var(--text-primary)]"), "Guides headings must use semantic high-contrast text.");

  assert(mergePage.includes("aura-live-tool aura-merge-tool"), "Merge page must use Aura live-tool visual layer.");
  assert(splitPage.includes("aura-live-tool aura-split-tool"), "Split page must use Aura live-tool visual layer.");
  assert(compressPage.includes("aura-live-tool aura-compress-tool"), "Compress page must use Aura live-tool visual layer.");

  const adminMarkers = [
    "AdminPageHeader",
    "AdminSectionCard",
    "AdminMetricCard",
    "AdminDataTable",
    "aura-panel",
    "Control Center",
    "Design System",
    "Guide",
  ];
  for (const marker of adminMarkers) {
    assert(rolloutSources.includes(marker) || navigation.includes(marker), `Missing admin Aura rollout marker: ${marker}`);
  }

  assert(navigation.includes("/admin/design-system"), "Design System navigation entry is missing.");
  assert(navigation.includes("/admin/guide"), "Guide navigation entry is missing.");
  assert(exists("app/admin/(protected)/guide/page.tsx"), "Protected admin guide page is missing.");
  assert(exists("app/admin/(protected)/design-system/page.tsx"), "Protected design-system page is missing.");
  assert(!exists("app/design-system/page.tsx"), "Design-system showcase must not be public.");
  assert(guide.includes("What happens when Compress PDF is disabled?"), "Guide must explain tool disable impact.");
  assert(guide.includes("What happens when public analytics is disabled?"), "Guide must explain analytics impact.");
  assert(guide.includes("Stored only"), "Guide must label stored-only controls.");

  assert(exists("docs/LUMEO_AURA_DESIGN_SYSTEM.md"), "Aura design-system documentation is missing.");
  assert(exists("docs/LUMEO_AURA_ROLLOUT.md"), "Aura rollout documentation is missing.");
  assert(read("docs/LUMEO_AURA_ROLLOUT.md").includes("Run 2"), "Aura rollout documentation must describe Run 2.");
  assert(read("docs/LUMEO_AURA_DESIGN_SYSTEM.md").includes("Run 2 Rollout"), "Aura design-system documentation must include Run 2 notes.");

  const migrationFiles = [
    "supabase/migrations/20260712_001_admin_members.sql",
    "supabase/migrations/20260712_002_control_center_foundation.sql",
    "supabase/migrations/20260712_003_public_tool_catalog.sql",
    "supabase/migrations/20260712_004_privacy_analytics.sql",
    "supabase/migrations/20260714_005_admin_analytics_reads.sql",
  ];
  for (const file of migrationFiles) {
    assert(exists(file), `Expected migration missing: ${file}`);
  }

  const merge = read("components/pdf/MergePdfTool.tsx");
  const split = read("components/pdf/SplitPdfTool.tsx");
  const compress = read("components/pdf/CompressPdfTool.tsx");
  assert(merge.includes("PDFDocument.create()"), "Merge PDF algorithm marker missing.");
  assert(split.includes("JSZip"), "Split PDF ZIP marker missing.");
  assert(compress.includes("buildCompressedCandidate"), "Compress PDF algorithm marker missing.");

  assert(!/console\.(log|info|warn|error)/.test(rolloutSources), "Production debug logging must not be introduced.");
  assert(!/processing_started|processing_succeeded|processing_failed|download_started/.test(rolloutSources), "Analytics V1 lifecycle events must not be reintroduced by Aura rollout.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(rolloutSources), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo Aura Run 2 public shell markers exist");
  console.log("PASS Control Center shared primitives and guide are present");
  console.log("PASS protected showcase remains protected");
  console.log("PASS documentation and verifier script are present");
  console.log("PASS protected package versions and PDF algorithm markers are intact");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo Aura rollout verification failed.");
  process.exit(1);
}
