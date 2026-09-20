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

const css = read("app/globals.css");
const ui = read("components/ui/Aura.tsx");
const workspace = read("components/pdf/workspace/ToolWorkspace.tsx");
const nav = read("lib/admin/navigation.ts");
const layout = read("app/layout.tsx");
const packageJson = JSON.parse(read("package.json"));

const requiredTokens = [
  "--lumeo-ink-950",
  "--lumeo-paper-50",
  "--lumeo-seal-500",
  "--lumeo-gold-400",
  "--lumeo-aura-400",
  "--surface-canvas",
  "--surface-raised",
  "--border-focus",
  "--shadow-floating",
  "--text-display-xl",
  "--space-4",
  "--radius-pill",
  "--motion-standard",
  "--ease-enter",
];

const requiredComponents = [
  "AuraButton",
  "AuraIconButton",
  "AuraCard",
  "AuraPanel",
  "AuraSurface",
  "AuraInput",
  "AuraTextarea",
  "AuraSelect",
  "AuraSwitch",
  "AuraCheckbox",
  "AuraRadioGroup",
  "AuraSegmentedControl",
  "AuraTabs",
  "AuraBadge",
  "AuraStatus",
  "AuraTooltip",
  "AuraPopover",
  "AuraDropdown",
  "AuraDialog",
  "AuraDrawer",
  "AuraToast",
  "AuraProgress",
  "AuraSkeleton",
  "AuraEmptyState",
  "AuraNotice",
  "AuraMetric",
  "AuraTable",
  "AuraPageHeader",
  "AuraSectionHeader",
  "AuraBreadcrumbs",
  "AuraSearchInput",
  "AuraCommandMenu",
  "AuraUploadSurface",
  "AuraFileCard",
  "AuraResultCard",
];

const toolFoundations = [
  "ToolUploadStage",
  "ToolSettingsStage",
  "ToolProcessingStage",
  "ToolResultStage",
  "ToolPrivacyNote",
  "ToolActionBar",
  "ToolDocumentSummary",
  "ToolModeCard",
  "ToolOptionRow",
  "L2WorkspaceHeader",
  "L2WorkspaceGrid",
  "L2WorkspaceToolbar",
];


try {
  for (const token of requiredTokens) {
    assert(css.includes(token), `Missing Aura token: ${token}`);
  }

  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced motion support is missing.");
  assert(css.includes("@media (forced-colors: active)"), "High contrast support is missing.");
  assert(css.includes(".aura-skip-link"), "Skip-to-content support is missing.");
  assert(css.includes("@keyframes aura-fade-in"), "Aura fade-in motion primitive missing.");
  assert(css.includes("@keyframes aura-progress-sheen"), "Aura progress sheen primitive missing.");

  for (const component of requiredComponents) {
    assert(new RegExp(`export function ${component}\\b`).test(ui), `Missing UI foundation: ${component}`);
  }

  for (const component of toolFoundations) {
    assert(new RegExp(`export function ${component}\\b`).test(workspace), `Missing tool workspace foundation: ${component}`);
  }


  assert(exists("components/layout/AuraPublicShell.tsx"), "Aura public shell foundation is missing.");
  assert(exists("lib/design-system/tokens.ts"), "Aura token registry is missing.");
  assert(exists("docs/LUMEO_AURA_DESIGN_SYSTEM.md"), "Aura design-system documentation is missing.");
  assert(!exists("app/admin/(protected)/design-system/page.tsx"), "Retired admin design-system showcase must stay removed.");
  assert(!exists("app/admin/(protected)/guide/page.tsx"), "Retired admin guide must stay removed.");
  assert(!nav.includes("/admin/design-system") && !nav.includes("/admin/guide"), "Retired reference routes must stay out of Control Center navigation.");
  assert(layout.includes("AnalyticsProvider") && layout.includes("AnalyticsPageView"), "Analytics providers must remain in root layout.");
  assert(layout.includes("aura-skip-link"), "Root layout must expose skip-to-content link.");

  const merge = read("components/pdf/MergePdfTool.tsx");
  const split = read("components/pdf/SplitPdfTool.tsx");
  const compress = read("components/pdf/CompressPdfTool.tsx");
  assert(merge.includes("PDFDocument.create()"), "Merge PDF processing algorithm appears changed or missing.");
  assert(split.includes("JSZip"), "Split PDF ZIP processing appears changed or missing.");
  assert(compress.includes("buildCompressedCandidate"), "Compress PDF processing appears changed or missing.");

  const migrationStatusFiles = [
    "supabase/migrations/20260712001_admin_members.sql",
    "supabase/migrations/20260712002_control_center_foundation.sql",
    "supabase/migrations/20260712003_public_tool_catalog.sql",
    "supabase/migrations/20260712004_privacy_analytics.sql",
    "supabase/migrations/20260714005_admin_analytics_reads.sql",
  ];
  for (const file of migrationStatusFiles) {
    assert(exists(file), `Expected migration missing: ${file}`);
  }

  assert(packageJson.scripts["verify:aura"] === "node scripts/verify-lumeo-aura.mjs", "verify:aura script is missing.");
  assert(packageJson.dependencies.next === "^16.3.0", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.8", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.112.2", "Supabase JS version changed unexpectedly.");

  const newSource = [ui, workspace, read("components/layout/AuraPublicShell.tsx")].join("\n");
  assert(!/console\.(log|info|warn|error)/.test(newSource), "Production debug logging must not be added.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(newSource), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo Aura design tokens exist");
  console.log("PASS component and tool workspace foundations exist");
  console.log("PASS retired Admin showcase and guide stay removed");
  console.log("PASS analytics providers remain mounted");
  console.log("PASS migrations and PDF algorithms are not replaced");
  console.log("PASS protected package versions are unchanged");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo Aura verification failed.");
  process.exit(1);
}
