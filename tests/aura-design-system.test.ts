import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const css = read("app/globals.css");
const ui = read("components/ui/Aura.tsx");
const workspace = read("components/pdf/workspace/ToolWorkspace.tsx");
const guidance = read("components/admin/guidance/AdminGuidance.tsx");
const showcase = read("app/admin/(protected)/design-system/page.tsx");
const guide = read("app/admin/(protected)/guide/page.tsx");
const homepage = read("app/page.tsx");
const pdfTools = read("app/pdf-tools/page.tsx");
const launcher = read("components/pdf/PdfToolLauncher.tsx");
const publicChrome = read("components/PublicPdfChrome.tsx");
const publicFooter = read("components/PublicFooter.tsx");
const publicMenu = read("components/public/PublicPdfToolsMenuClient.tsx");
const placeholder = read("components/pdf/PdfToolPlaceholder.tsx");
const directoryLoading = read("app/pdf-tools/loading.tsx");
const directoryError = read("app/pdf-tools/error.tsx");
const rolloutDoc = read("docs/LUMEO_AURA_ROLLOUT.md");
const lumeo2Doc = read("docs/LUMEO_2_DESIGN_SYSTEM.md");
const lumeo2Verifier = read("scripts/verify-lumeo-2-foundation.mjs");
const publicExperienceVerifier = read("scripts/verify-lumeo-2-public-experience.mjs");
const mergePage = read("app/pdf/merge/page.tsx");
const splitPage = read("app/pdf/split/page.tsx");
const compressPage = read("app/pdf/compress/page.tsx");

test("Aura design tokens cover colour, surface, type, spacing, radius and motion", () => {
  for (const token of [
    "--atelier-canvas-950",
    "--atelier-surface-2",
    "--atelier-ivory-100",
    "--atelier-sage-500",
    "--atelier-brass-400",
    "--atelier-info",
    "--maison-canvas-950",
    "--maison-surface-2",
    "--maison-ivory-50",
    "--maison-green-500",
    "--maison-bronze-400",
    "--maison-info",
    "--lumeo-ink-950",
    "--lumeo-paper-50",
    "--lumeo-seal-500",
    "--lumeo-gold-400",
    "--lumeo-aura-400",
    "--canvas-950",
    "--paper-50",
    "--emerald-500",
    "--champagne-400",
    "--sky-400",
    "--ruby-500",
    "--text-primary",
    "--text-secondary",
    "--text-muted",
    "--text-subtle",
    "--text-on-accent",
    "--text-info",
    "--surface-floating",
    "--surface-interactive",
    "--surface-selected",
    "--border-hairline",
    "--border-selected",
    "--shadow-interactive",
    "--text-display-xl",
    "--font-display-xl",
    "--space-4",
    "--space-24",
    "--gap-section",
    "--padding-panel",
    "--radius-pill",
    "--motion-standard",
    "--ease-emphasized",
  ]) {
    assert.ok(css.includes(token), `${token} should exist`);
  }
});

test("Lumeo Atelier retheme keeps soft semantic tokens and interaction contracts", () => {
  assert.ok(css.includes("--atelier-canvas-950: #111310;"));
  assert.ok(css.includes("--atelier-sage-500: #6f8b73;"));
  assert.ok(css.includes("--atelier-brass-400: #c4aa77;"));
  assert.ok(css.includes("--action-primary: var(--atelier-sage-500);"));
  assert.ok(css.includes("rgb(var(--atelier-sage-rgb) / 0.08)"));
  assert.ok(css.includes("rgb(var(--atelier-brass-rgb) / 0.06)"));
  assert.ok(css.includes("background: var(--surface-canvas);"));
  assert.ok(ui.includes("rgba(var(--champagne-rgb),0.2)"));
  assert.ok(ui.includes("rgba(var(--atelier-sage-rgb),0.09)"));
  assert.doesNotMatch(ui, /rgba\(var\(--sky-rgb\)/);
  assert.ok(showcase.includes("Lumeo Atelier"));
  assert.ok(showcase.includes("--atelier-sage-500"));
  assert.ok(lumeo2Doc.includes("Lumeo Atelier Theme"));
  assert.ok(lumeo2Doc.includes("Heritage Sage"));
  assert.ok(publicMenu.includes("const MENU_ID = \"lumeo-pdf-tools-menu\""));
  assert.ok(publicMenu.includes("md:w-[min(21rem,calc(100vw-2rem))]"));
  assert.ok(publicMenu.includes("xl:right-[-20rem]"));
  assert.ok(publicMenu.includes("Combine documents"));
  assert.ok(publicMenu.includes("Extract pages"));
  assert.ok(publicMenu.includes("md:max-h-[70vh]"));
  assert.doesNotMatch(publicMenu, /md:grid-cols-2/);
  assert.ok(workspace.includes("inputRef.current?.click()"));
  assert.ok(workspace.includes("onFilesSelected?.(event.dataTransfer.files)"));
  assert.ok(workspace.includes("max-w-[560px]"));
  assert.ok(homepage.includes("text-[clamp(2.6rem,6.1vw,4.85rem)]"));
  assert.doesNotMatch(homepage, /#0D2C6D|sky-rgb|bg-\[var\(--surface-canvas\)\]/);
});

test("Aura components expose accessible interaction foundations", () => {
  for (const variant of ["primary", "secondary", "ghost", "danger", "success", "premium", "icon"]) {
    assert.ok(ui.includes(`${variant}:`), `${variant} button variant should exist`);
  }
  assert.match(ui, /role="switch"/);
  assert.match(ui, /aria-checked/);
  assert.match(ui, /✓/);
  assert.match(ui, /role="radiogroup"/);
  assert.match(ui, /ArrowLeft/);
  assert.match(ui, /ArrowRight/);
  assert.match(ui, /role="dialog"/);
  assert.match(ui, /aria-modal="true"/);
  assert.match(ui, /event\.key === "Escape"/);
  assert.match(ui, /focus-visible/);
  assert.match(ui, /aria-live="polite"/);
});

test("reduced motion and high contrast support exist", () => {
  assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
  assert.ok(css.includes("@media (forced-colors: active)"));
  assert.ok(css.includes(".aura-skip-link"));
  assert.ok(css.includes(".lumeo2-button-press"));
  assert.ok(css.includes(".lumeo2-segmented-indicator"));
  assert.ok(css.includes("@keyframes lumeo2-drag-highlight"));
});

test("tool workspace and admin guidance foundations are present", () => {
  for (const name of ["ToolWorkspaceShell", "ToolUploadStage", "ToolResultStage", "ToolPrivacyNote"]) {
    assert.ok(workspace.includes(`export function ${name}`), `${name} should exist`);
  }

  for (const name of [
    "L2ToolPageHeader",
    "L2ToolWorkspace",
    "L2ToolMainColumn",
    "L2ToolSettingsPanel",
    "L2ToolSectionHeader",
    "L2UploadStage",
    "L2FileList",
    "L2FileCard",
    "L2DocumentProfile",
    "L2SettingsGroup",
    "L2OptionRow",
    "L2ModeSelector",
    "L2AdvancedDisclosure",
    "L2ActionArea",
    "L2ProgressState",
    "L2ResultState",
    "L2PrivacyNote",
  ]) {
    assert.ok(workspace.includes(`export function ${name}`), `${name} should exist`);
  }

  for (const name of ["AdminWhatThisControls", "AdminImpactPreview", "AdminStoredOnlyNotice", "AdminSettingExplanation"]) {
    assert.ok(guidance.includes(`export function ${name}`), `${name} should exist`);
  }
});

test("protected showcase demonstrates the foundation without public exposure markers", () => {
  assert.ok(showcase.includes('"use client"'));
  assert.ok(showcase.includes("Lumeo Atelier"));
  assert.ok(showcase.includes("Atelier theme system"));
  assert.ok(showcase.includes("Tool workspace foundations"));
  assert.ok(showcase.includes("Control Center guidance"));
  assert.ok(showcase.includes("Responsive and reduced-motion notes"));
  assert.doesNotMatch(showcase, /console\.(log|info|warn|error)/);
});

test("Lumeo 2 upload, file-card, and result foundations are accessible", () => {
  assert.ok(ui.includes("onActivate"));
  assert.ok(ui.includes('role={onActivate ? "button" : undefined}'));
  assert.ok(ui.includes("supportedTypes"));
  assert.ok(ui.includes("privacyNote"));
  assert.ok(ui.includes("onRemove"));
  assert.ok(ui.includes("onMoveUp"));
  assert.ok(ui.includes("onMoveDown"));
  assert.ok(ui.includes("removeLabel"));
  assert.ok(ui.includes("primaryAction"));
  assert.ok(ui.includes("secondaryAction"));
  assert.ok(ui.includes("localMessage"));
});

test("Lumeo 2 documentation and verifier cover the flagship foundation", () => {
  assert.ok(lumeo2Doc.includes("Lumeo 2.0"));
  assert.ok(lumeo2Doc.includes("Lumeo Canvas"));
  assert.ok(lumeo2Doc.includes("Run 2 migration plan"));
  assert.ok(lumeo2Verifier.includes("verify:lumeo2-foundation"));
  assert.ok(lumeo2Verifier.includes("supabase/migrations/"));
  assert.ok(lumeo2Verifier.includes("components/pdf/MergePdfTool.tsx"));
  assert.ok(lumeo2Verifier.includes("components/analytics/AnalyticsProvider.tsx"));
});

test("Lumeo 2 public homepage keeps five configured slots plus permanent sixth card", () => {
  assert.ok(homepage.includes("Documents, beautifully handled."));
  assert.ok(homepage.includes("Fast PDF tools that work privately in your browser."));
  assert.ok(homepage.includes("L2TrustRail"));
  assert.ok(launcher.includes("getPublicHomepageTools"));
  assert.ok(launcher.includes("configuredTools.slice(0, 5)"));
  assert.ok(launcher.includes("All PDF Tools"));
  assert.ok(launcher.includes("featured={index === 0}"));
  assert.ok(launcher.includes("allTools={index === 5}"));
  assert.doesNotMatch(homepage, /Start with Merge PDF/);
  assert.doesNotMatch(homepage, /\b(ratings?|users?|downloads?|processed)\b/i);
});

test("Lumeo 2 public cards, navigation and menu are accessible", () => {
  for (const name of ["L2FeaturedToolCard", "L2ToolCard", "L2DirectoryToolCard", "L2PublicHeader", "L2MenuSurface"]) {
    assert.ok(ui.includes(`export function ${name}`) || ui.includes(`export const ${name}`), `${name} should exist`);
  }
  assert.ok(publicChrome.includes("L2PublicHeader"));
  assert.ok(publicChrome.includes("L2MobileNavClient"));
  assert.ok(publicMenu.includes("aria-expanded"));
  assert.ok(publicMenu.includes("aria-controls"));
  assert.ok(publicMenu.includes("aria-haspopup"));
  assert.ok(publicMenu.includes("Escape"));
  assert.ok(publicMenu.includes("View all PDF tools"));
});

test("Lumeo 2 public interaction spacing fixes are guarded", () => {
  assert.ok(publicMenu.includes("const [open, setOpen] = useState(false)"));
  assert.ok(publicMenu.includes("buttonRef"));
  assert.ok(publicMenu.includes("wrapperRef"));
  assert.ok(publicMenu.includes("const MENU_ID = \"lumeo-pdf-tools-menu\""));
  assert.ok(publicMenu.includes("type=\"button\""));
  assert.ok(publicMenu.includes("aria-haspopup=\"menu\""));
  assert.ok(publicMenu.includes("aria-expanded={open}"));
  assert.ok(publicMenu.includes("aria-controls={MENU_ID}"));
  assert.ok(publicMenu.includes("id={MENU_ID}"));
  assert.ok(publicMenu.includes("wrapperRef.current?.contains(target)"));
  assert.ok(publicMenu.includes("document.addEventListener(\"pointerdown\", handlePointerDown, true)"));
  assert.ok(publicMenu.includes("setOpen((value) => !value)"));
  assert.ok(publicMenu.includes("setOpen(false);"));
  assert.doesNotMatch(publicMenu, /console\./);

  assert.ok(ui.includes("l2-trust-rail-grid"));
  assert.ok(ui.includes("md:grid-cols-3"));
  assert.ok(ui.includes("md:justify-center"));
  assert.ok(ui.includes("sm:max-w-[320px]"));
  assert.ok(css.includes("width: min(100%, 320px);"));
  assert.ok(css.includes("width: 100%;"));
  assert.ok(ui.includes("l2-directory-card-surface"));
  assert.ok(css.includes(".l2-directory-card-surface"));

  assert.ok(workspace.includes("type=\"file\""));
  assert.ok(workspace.includes("accept={accept}"));
  assert.ok(workspace.includes("multiple={multiple}"));
  assert.ok(workspace.includes("inputRef.current?.click()"));
  assert.ok(workspace.includes("event.currentTarget.files"));
  assert.ok(workspace.includes("event.currentTarget.value = \"\""));
  assert.ok(workspace.includes("onDragEnter={handleDragEnter}"));
  assert.ok(workspace.includes("onDragOver={handleDragOver}"));
  assert.ok(workspace.includes("onDragLeave={handleDragLeave}"));
  assert.ok(workspace.includes("onDrop={handleDrop}"));
  assert.ok(workspace.includes("event.preventDefault();"));
  assert.ok(workspace.includes("onFilesSelected?.(event.dataTransfer.files)"));
});

test("Lumeo 2 directory, loading and error states use public foundations", () => {
  assert.ok(pdfTools.includes("getPublicPdfCatalog"));
  assert.ok(pdfTools.includes("L2DirectoryToolCard"));
  assert.ok(directoryLoading.includes("L2SkeletonCard"));
  assert.ok(directoryError.includes("L2PublicErrorState"));
  assert.doesNotMatch(pdfTools, /\b(popular|ratings?|users?|downloads?)\b/i);
});

test("Lumeo 2 placeholder tools are clearly non-operational", () => {
  assert.ok(placeholder.includes("Non-operational preview"));
  assert.ok(placeholder.includes("No files can be selected or processed"));
  assert.ok(placeholder.includes("Browse PDF tools"));
  assert.ok(placeholder.includes("Back home"));
  assert.doesNotMatch(placeholder, /AuraUploadSurface|Select files|Start conversion|Convert now/);
});

test("Lumeo 2 footer has grouped navigation and public verifier exists", () => {
  assert.ok(publicFooter.includes("Tools"));
  assert.ok(publicFooter.includes("Company"));
  assert.ok(publicFooter.includes("Legal"));
  assert.ok(publicFooter.includes("Private, browser-first PDF tools."));
  assert.ok(publicExperienceVerifier.includes("verify:lumeo2-public-experience"));
  assert.ok(lumeo2Doc.includes("Homepage Hierarchy"));
  assert.ok(lumeo2Doc.includes("What Remains For Run 3") || lumeo2Doc.includes("What remains for Run 3"));
});

test("new Aura code avoids prohibited debug and secret patterns", () => {
  const combined = [ui, workspace, guidance, showcase].join("\n");
  assert.doesNotMatch(combined, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(combined, /service_role|secret[_-]?key|password\s*=/i);
});

test("Run 2 public rollout uses Aura surfaces and keeps tools visible", () => {
  assert.ok(homepage.includes("aura-home"));
  assert.ok(homepage.includes("Documents, beautifully handled."));
  assert.ok(homepage.includes("Fast PDF tools that work privately in your browser."));
  assert.ok(homepage.includes("text-[var(--text-primary)]"));
  assert.ok(pdfTools.includes("aura-directory-section"));
  assert.ok(publicChrome.includes("aura-public-nav"));
  assert.ok(publicFooter.includes("aura-public-footer"));
  assert.doesNotMatch(homepage, /bg-\[rgba\(255,253,247/);
  assert.doesNotMatch(publicChrome, /bg-\[rgba\(255,253,247/);
  assert.doesNotMatch(publicFooter, /bg-\[rgba\(255,253,247/);
});

test("live PDF tool pages use the Aura visual layer without algorithm assertions changing", () => {
  assert.ok(mergePage.includes("aura-live-tool aura-merge-tool"));
  assert.ok(splitPage.includes("aura-live-tool aura-split-tool"));
  assert.ok(compressPage.includes("aura-live-tool aura-compress-tool"));
  assert.ok(mergePage.includes("L2ToolPageHeader"));
  assert.ok(splitPage.includes("L2ToolPageHeader"));
  assert.ok(compressPage.includes("L2ToolPageHeader"));
  assert.ok(mergePage.includes("max-w-[1240px]"));
  assert.ok(splitPage.includes("max-w-[1240px]"));
  assert.ok(compressPage.includes("max-w-[1240px]"));
  assert.ok(mergePage.includes("l2-live-tool-workspace"));
  assert.ok(splitPage.includes("l2-live-tool-workspace"));
  assert.ok(compressPage.includes("l2-live-tool-workspace"));
  assert.ok(css.includes(".aura-live-tool"));
  assert.ok(css.includes(".l2-live-tool-workspace"));
  assert.ok(css.includes(".l2-tool-settings-panel"));
  assert.ok(css.includes("@media (max-width: 1023px)"));
  assert.ok(workspace.includes("Private by design · Browser-only · Cleared after download"));
  assert.doesNotMatch([mergePage, splitPage, compressPage].join("\n"), /processing_started|processing_succeeded|processing_failed|download_started/);
});

test("Run 3 PDF workspace rules preserve algorithms and Analytics V1 scope", () => {
  const mergeTool = read("components/pdf/MergePdfTool.tsx");
  const splitTool = read("components/pdf/SplitPdfTool.tsx");
  const compressTool = read("components/pdf/CompressPdfTool.tsx");

  assert.ok(mergeTool.includes("PDFDocument.create()"));
  assert.ok(mergeTool.includes("copyPages"));
  assert.ok(splitTool.includes("JSZip"));
  assert.ok(splitTool.includes("copyPages"));
  assert.ok(compressTool.includes("Target Size Studio"));
  assert.ok(compressTool.includes("Under 100 KB"));
  assert.ok(compressTool.includes("Under 200 KB"));
  assert.ok(compressTool.includes("Under 400 KB"));
  assert.doesNotMatch([mergeTool, splitTool, compressTool].join("\n"), /processing_started|processing_succeeded|processing_failed|download_started/);
});

test("Run 4 live PDF tools use shared workspace primitives internally", () => {
  const tools = [
    ["Merge", read("components/pdf/MergePdfTool.tsx")],
    ["Split", read("components/pdf/SplitPdfTool.tsx")],
    ["Compress", read("components/pdf/CompressPdfTool.tsx")],
  ] as const;

  for (const [name, source] of tools) {
    for (const primitive of ["L2UploadStage", "L2ToolWorkspace", "L2ToolMainColumn", "L2ToolSettingsPanel", "L2ActionArea", "L2PrivacyNote"]) {
      assert.ok(source.includes(primitive), `${name} should use ${primitive}`);
    }
    assert.ok(source.includes("l2-tool-empty-state"), `${name} should use compact empty state class`);
    assert.ok(source.includes("l2-tool-deep-workspace"), `${name} should use deep workspace class`);
    assert.ok(source.includes("lumeo-primary-action"), `${name} should mark its primary actions`);
  }

  const mergeTool = read("components/pdf/MergePdfTool.tsx");
  const splitTool = read("components/pdf/SplitPdfTool.tsx");
  const compressTool = read("components/pdf/CompressPdfTool.tsx");
  assert.ok(mergeTool.includes("inputId=\"merge-pdf-upload\""));
  assert.ok(mergeTool.includes("multiple"));
  assert.ok(mergeTool.includes("onFilesSelected={(selectedFiles)"));
  assert.ok(splitTool.includes("inputId=\"split-pdf-upload\""));
  assert.ok(splitTool.includes("multiple={false}"));
  assert.ok(splitTool.includes("onFilesSelected={handleFiles}"));
  assert.ok(compressTool.includes("inputId=\"compress-pdf-upload\""));
  assert.ok(compressTool.includes("multiple={false}"));
  assert.ok(compressTool.includes("onFilesSelected={handleFiles}"));
});

test("Run 4 live PDF tool rules remain tool-specific and truthful", () => {
  const mergeTool = read("components/pdf/MergePdfTool.tsx");
  const splitTool = read("components/pdf/SplitPdfTool.tsx");
  const compressTool = read("components/pdf/CompressPdfTool.tsx");

  assert.ok(mergeTool.includes("Merge options"));
  assert.ok(mergeTool.includes("One combined PDF using the file order shown."));
  assert.ok(mergeTool.includes("Move ${item.file.name} up"));
  assert.ok(mergeTool.includes("Remove ${item.file.name}"));
  assert.doesNotMatch(mergeTool.match(/<L2ToolSettingsPanel title="Merge options"[\s\S]*?<\/L2ToolSettingsPanel>/)?.[0] ?? "", /metadata removal|archive/i);

  for (const splitMode of ['"extract"', '"ranges"', '"everyPage"', '"everyN"', '"remove"']) {
    assert.ok(splitTool.includes(splitMode), `Split should keep ${splitMode}`);
  }
  assert.ok(splitTool.includes("Examples: 1-3, 5, odd, even, all, or 1-end."));

  assert.ok(compressTool.includes("Quality mode"));
  assert.ok(compressTool.includes("Target size"));
  assert.ok(compressTool.includes("Grayscale"));
  assert.ok(compressTool.includes("Target achieved"));
  assert.ok(compressTool.includes("Closest safe result"));
  assert.ok(compressTool.includes("Compression not beneficial"));
  assert.ok(compressTool.includes("Unable to process"));
});

test("Run 3 workspace documentation and verifier exist", () => {
  const workspaceVerifier = read("scripts/verify-lumeo-2-workspaces.mjs");
  assert.ok(workspaceVerifier.includes("verify:lumeo2-workspaces"));
  assert.ok(workspaceVerifier.includes("L2ToolSettingsPanel"));
  assert.ok(workspaceVerifier.includes("PDFDocument.create()"));
  assert.ok(lumeo2Doc.includes("Tool Workspace Lifecycle"));
  assert.ok(lumeo2Doc.includes("Primary Action Positioning"));
  assert.ok(lumeo2Doc.includes("Target Size Studio"));
  assert.ok(lumeo2Doc.includes("Deep Workspace Implementation"));
  assert.ok(lumeo2Doc.includes("What Remains For Run 5") || lumeo2Doc.includes("What remains for Run 5"));
});

test("Run 2 admin guide documents stored-only and runtime impact states", () => {
  assert.ok(guide.includes("What happens when Compress PDF is disabled?"));
  assert.ok(guide.includes("What happens when public analytics is disabled?"));
  assert.ok(guide.includes("Stored only"));
  assert.ok(guide.includes("Requires setup") || guide.includes("requires setup"));
});

test("Run 2 documentation records constraints and review URLs", () => {
  assert.ok(rolloutDoc.includes("Run 2"));
  assert.ok(rolloutDoc.includes("No SQL"));
  assert.ok(rolloutDoc.includes("PDF processing algorithms"));
  assert.ok(rolloutDoc.includes("http://localhost:3000/admin/design-system"));
  assert.ok(rolloutDoc.includes("http://localhost:3000/admin/guide"));
});
