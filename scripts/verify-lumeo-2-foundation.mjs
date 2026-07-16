import { execFileSync } from "node:child_process";
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

function changedFiles() {
  const output = execFileSync("git", ["diff", "--name-only"], { cwd: root, encoding: "utf8" });
  return output.split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

const css = read("app/globals.css");
const ui = read("components/ui/Aura.tsx");
const workspace = read("components/pdf/workspace/ToolWorkspace.tsx");
const publicShell = read("components/layout/AuraPublicShell.tsx");
const footer = read("components/PublicFooter.tsx");
const controlShell = read("components/admin/ControlCenterShell.tsx");
const sidebar = read("components/admin/ControlCenterSidebar.tsx");
const mobileNav = read("components/admin/ControlCenterMobileNav.tsx");
const guidance = read("components/admin/guidance/AdminGuidance.tsx");
const showcase = read("app/admin/(protected)/design-system/page.tsx");
const tokens = read("lib/design-system/tokens.ts");
const docs = read("docs/LUMEO_2_DESIGN_SYSTEM.md");
const packageJson = JSON.parse(read("package.json"));
const mergeTool = read("components/pdf/MergePdfTool.tsx");
const splitTool = read("components/pdf/SplitPdfTool.tsx");
const compressTool = read("components/pdf/CompressPdfTool.tsx");

const requiredCssTokens = [
  "--atelier-canvas-950",
  "--atelier-canvas-900",
  "--atelier-canvas-850",
  "--atelier-canvas-800",
  "--atelier-surface-1",
  "--atelier-surface-2",
  "--atelier-surface-3",
  "--atelier-surface-4",
  "--atelier-ivory-50",
  "--atelier-ivory-100",
  "--atelier-ivory-200",
  "--atelier-ivory-300",
  "--atelier-ivory-500",
  "--atelier-ivory-700",
  "--atelier-sage-300",
  "--atelier-sage-400",
  "--atelier-sage-500",
  "--atelier-sage-600",
  "--atelier-sage-700",
  "--atelier-brass-300",
  "--atelier-brass-400",
  "--atelier-brass-500",
  "--atelier-brass-600",
  "--atelier-success",
  "--atelier-warning",
  "--atelier-danger",
  "--atelier-info",
  "--atelier-disabled",
  "--maison-canvas-950",
  "--maison-canvas-900",
  "--maison-canvas-850",
  "--maison-canvas-800",
  "--maison-canvas-750",
  "--maison-surface-1",
  "--maison-surface-2",
  "--maison-surface-3",
  "--maison-surface-4",
  "--maison-ivory-50",
  "--maison-ivory-100",
  "--maison-ivory-200",
  "--maison-ivory-300",
  "--maison-ivory-500",
  "--maison-ivory-700",
  "--maison-green-400",
  "--maison-green-500",
  "--maison-green-600",
  "--maison-green-700",
  "--maison-bronze-300",
  "--maison-bronze-400",
  "--maison-bronze-500",
  "--maison-bronze-600",
  "--maison-success",
  "--maison-warning",
  "--maison-danger",
  "--maison-info",
  "--maison-planned",
  "--maison-unavailable",
  "--canvas-950",
  "--canvas-900",
  "--canvas-850",
  "--canvas-800",
  "--canvas-750",
  "--paper-50",
  "--paper-100",
  "--paper-200",
  "--paper-300",
  "--paper-500",
  "--paper-700",
  "--emerald-400",
  "--emerald-500",
  "--emerald-600",
  "--emerald-700",
  "--champagne-300",
  "--champagne-400",
  "--champagne-500",
  "--sky-300",
  "--sky-400",
  "--sky-500",
  "--ruby-400",
  "--ruby-500",
  "--ruby-600",
  "--success",
  "--warning",
  "--danger",
  "--info",
  "--planned",
  "--unavailable",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-subtle",
  "--text-on-accent",
  "--text-accent",
  "--text-premium",
  "--text-success",
  "--text-warning",
  "--text-danger",
  "--text-info",
  "--surface-canvas",
  "--surface-base",
  "--surface-raised",
  "--surface-elevated",
  "--surface-floating",
  "--surface-interactive",
  "--surface-selected",
  "--surface-input",
  "--surface-overlay",
  "--surface-danger",
  "--surface-success",
  "--border-hairline",
  "--border-subtle",
  "--border-default",
  "--border-strong",
  "--border-focus",
  "--border-selected",
  "--border-danger",
  "--shadow-xs",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
  "--shadow-xl",
  "--shadow-floating",
  "--shadow-interactive",
  "--shadow-focus",
  "--shadow-success",
  "--shadow-danger",
  "--action-primary",
  "--action-primary-hover",
  "--action-primary-active",
  "--action-secondary",
  "--action-danger",
  "--space-24",
  "--gap-section",
  "--gap-card",
  "--gap-content",
  "--gap-control",
  "--gap-compact",
  "--padding-page",
  "--padding-panel",
  "--padding-mobile-page",
  "--radius-pill",
  "--motion-standard",
  "--ease-emphasized",
];

const requiredFontTokens = [
  "--font-display-xl",
  "--font-display-lg",
  "--font-display-md",
  "--font-heading-xl",
  "--font-heading-lg",
  "--font-heading-md",
  "--font-heading-sm",
  "--font-body-lg",
  "--font-body-md",
  "--font-body-sm",
  "--font-label",
  "--font-caption",
  "--font-micro",
];

const buttonVariants = ["primary", "secondary", "ghost", "danger", "success", "premium", "icon"];
const requiredUiMarkers = [
  "export function AuraSwitch",
  "role=\"switch\"",
  "aria-checked",
  "export function AuraSegmentedControl",
  "role=\"radiogroup\"",
  "ArrowLeft",
  "ArrowRight",
  "export function AuraUploadSurface",
  "onActivate",
  "role={onActivate ? \"button\" : undefined}",
  "export function AuraFileCard",
  "onRemove",
  "onMoveUp",
  "onMoveDown",
  "export function AuraResultCard",
  "primaryAction",
  "secondaryAction",
];

const protectedFiles = [
  "components/analytics/AnalyticsProvider.tsx",
  "components/analytics/AnalyticsPageView.tsx",
  "lib/analytics/client.ts",
  "lib/analytics/state.ts",
  "lib/analytics/types.ts",
  "lib/admin/data.ts",
];

try {
  for (const token of requiredCssTokens) {
    assert(css.includes(token), `Missing Lumeo 2 token: ${token}`);
  }
  for (const token of requiredFontTokens) {
    assert(css.includes(token), `Missing Lumeo 2 typography token: ${token}`);
  }

  assert(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion support is missing.");
  assert(css.includes("@media (forced-colors: active)"), "High-contrast support is missing.");
  assert(css.includes("@keyframes lumeo2-drag-highlight"), "Drag-highlight motion primitive is missing.");
  assert(css.includes(".lumeo2-button-press"), "Button press primitive is missing.");
  assert(css.includes(".lumeo2-segmented-indicator"), "Segmented indicator primitive is missing.");
  assert(!/--surface-canvas:\s*#fff/i.test(css), "Surface canvas must not become plain white.");
  assert(!/--surface-canvas:\s*#000/i.test(css), "Surface canvas must not become pure black.");

  for (const variant of buttonVariants) {
    assert(ui.includes(`${variant}:`), `Missing Aura button variant: ${variant}`);
  }
  for (const marker of requiredUiMarkers) {
    assert(ui.includes(marker), `Missing UI foundation marker: ${marker}`);
  }

  assert(workspace.includes("aura-tool-workspace-layout"), "Tool workspace layout foundation marker missing.");
  assert(workspace.includes("aura-tool-workspace-inspector"), "Tool workspace inspector foundation marker missing.");
  assert(publicShell.includes("AuraPublicNav") && publicShell.includes("AuraPublicFooter"), "Public shell foundation is missing.");
  assert(footer.includes("aura-public-footer"), "Public footer foundation marker is missing.");
  assert(controlShell.includes("ControlCenterShell"), "Control Center shell foundation is missing.");
  assert(sidebar.includes("ControlCenterSidebar"), "Control Center sidebar foundation is missing.");
  assert(mobileNav.includes("ControlCenterMobileNav"), "Control Center mobile nav foundation is missing.");
  assert(guidance.includes("AdminWhatThisControls"), "Admin guidance foundations are missing.");
  assert(showcase.includes("Lumeo Atelier") && showcase.includes("Atelier theme system"), "Protected showcase must display Lumeo Atelier.");
  assert(showcase.includes("Responsive and reduced-motion notes"), "Showcase must demonstrate responsive and reduced-motion notes.");
  assert(exists("app/admin/(protected)/design-system/page.tsx"), "Protected showcase is missing.");
  assert(!exists("app/design-system/page.tsx"), "Design-system showcase must not be public.");

  for (const registry of [
    "lumeo2FoundationTokens",
    "lumeo2BorderTokens",
    "lumeo2ShadowTokens",
    "lumeo2TypographyTokens",
    "lumeo2SpacingTokens",
    "lumeo2RadiusTokens",
    "maisonActionTokens",
  ]) {
    assert(tokens.includes(registry), `Missing token registry: ${registry}`);
  }

  assert(docs.includes("Lumeo 2.0"), "Lumeo 2 documentation is missing its title.");
  assert(docs.includes("Lumeo Atelier Theme"), "Atelier theme documentation is missing.");
  assert(docs.includes("Run 2 migration plan"), "Lumeo 2 documentation must include the Run 2 migration plan.");
  assert(css.includes("--action-primary: var(--atelier-sage-500);"), "Atelier Heritage Sage must be the primary action token.");
  assert(css.includes("--gap-section: var(--space-12);") && tokens.includes("--gap-section"), "Final Atelier semantic spacing tokens are missing.");
  assert(css.includes("rgb(var(--atelier-sage-rgb) / 0.08)") && css.includes("rgb(var(--atelier-brass-rgb) / 0.06)") && css.includes("background: var(--surface-canvas);"), "Atelier canvas must use valid layered CSS Color 4 syntax.");
  assert(!css.includes("#7ecbe8") && !css.includes("#45add5") && !css.includes("#2a87af"), "Blue-dominant public accent values must not remain in the semantic foundation.");
  assert(!ui.includes("rgba(var(--sky-rgb)"), "Shared UI components must not use sky-rgb as a public focus or action accent.");
  assert(packageJson.scripts["verify:lumeo2-foundation"] === "node scripts/verify-lumeo-2-foundation.mjs", "verify:lumeo2-foundation script is missing.");
  assert(packageJson.dependencies.next === "^16.2.10", "Next.js version changed unexpectedly.");
  assert(packageJson.dependencies.react === "^19.2.7", "React version changed unexpectedly.");
  assert(packageJson.dependencies["@supabase/supabase-js"] === "^2.110.2", "Supabase JS version changed unexpectedly.");
  assert(packageJson.dependencies.firebase === "^12.16.0", "Firebase version changed unexpectedly.");

  const modified = changedFiles();
  for (const file of modified) {
    assert(!file.startsWith("supabase/migrations/"), `Supabase migration changed in Lumeo 2 foundation run: ${file}`);
    assert(!protectedFiles.includes(file), `Protected analytics or admin-data file changed: ${file}`);
  }

  assert(mergeTool.includes("PDFDocument.create()") && mergeTool.includes("copyPages"), "Merge PDF algorithm markers changed unexpectedly.");
  assert(splitTool.includes("JSZip") && splitTool.includes("copyPages"), "Split PDF algorithm markers changed unexpectedly.");
  assert(compressTool.includes("Target Size Studio") && compressTool.includes("Under 100 KB") && compressTool.includes("Under 200 KB") && compressTool.includes("Under 400 KB"), "Compress Target Size Studio markers changed unexpectedly.");
  assert(!/processing_started|processing_succeeded|processing_failed|download_started/.test([mergeTool, splitTool, compressTool].join("\n")), "Analytics lifecycle events must not be reintroduced.");

  const scannedSource = [ui, workspace, publicShell, footer, controlShell, sidebar, mobileNav, guidance, showcase, tokens, docs].join("\n");
  assert(!/console\.(log|info|warn|error)/.test(scannedSource), "Production debug logging must not be added.");
  assert(!/service_role|secret[_-]?key|password\s*=/.test(scannedSource), "No hard-coded secrets may be introduced.");

  console.log("PASS Lumeo 2 semantic tokens exist");
  console.log("PASS Lumeo 2 UI, upload, file-card, result, and workspace foundations exist");
  console.log("PASS protected showcase and documentation exist");
  console.log("PASS protected dependency versions remain unchanged");
  console.log("PASS no migrations, analytics provider, or admin data files changed");
  console.log("PASS live PDF processing markers and Analytics V1 scope remain protected");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Lumeo 2 foundation verification failed.");
  process.exit(1);
}
