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
const publicChrome = read("components/PublicPdfChrome.tsx");
const publicFooter = read("components/PublicFooter.tsx");
const rolloutDoc = read("docs/LUMEO_AURA_ROLLOUT.md");
const lumeo2Doc = read("docs/LUMEO_2_DESIGN_SYSTEM.md");
const lumeo2Verifier = read("scripts/verify-lumeo-2-foundation.mjs");
const mergePage = read("app/pdf/merge/page.tsx");
const splitPage = read("app/pdf/split/page.tsx");
const compressPage = read("app/pdf/compress/page.tsx");

test("Aura design tokens cover colour, surface, type, spacing, radius and motion", () => {
  for (const token of [
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
    "--radius-pill",
    "--motion-standard",
    "--ease-emphasized",
  ]) {
    assert.ok(css.includes(token), `${token} should exist`);
  }
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

  for (const name of ["AdminWhatThisControls", "AdminImpactPreview", "AdminStoredOnlyNotice", "AdminSettingExplanation"]) {
    assert.ok(guidance.includes(`export function ${name}`), `${name} should exist`);
  }
});

test("protected showcase demonstrates the foundation without public exposure markers", () => {
  assert.ok(showcase.includes('"use client"'));
  assert.ok(showcase.includes("Lumeo 2.0"));
  assert.ok(showcase.includes("Lumeo Canvas"));
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

test("new Aura code avoids prohibited debug and secret patterns", () => {
  const combined = [ui, workspace, guidance, showcase].join("\n");
  assert.doesNotMatch(combined, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(combined, /service_role|secret[_-]?key|password\s*=/i);
});

test("Run 2 public rollout uses Aura surfaces and keeps tools visible", () => {
  assert.ok(homepage.includes("aura-home"));
  assert.ok(homepage.includes("Work with PDFs beautifully."));
  assert.ok(homepage.includes("Private, fast, browser-first."));
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
  assert.ok(css.includes(".aura-live-tool"));
  assert.doesNotMatch([mergePage, splitPage, compressPage].join("\n"), /processing_started|processing_succeeded|processing_failed|download_started/);
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
