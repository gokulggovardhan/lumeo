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

test("Aura design tokens cover colour, surface, type, spacing, radius and motion", () => {
  for (const token of [
    "--lumeo-ink-950",
    "--lumeo-paper-50",
    "--lumeo-seal-500",
    "--lumeo-gold-400",
    "--lumeo-aura-400",
    "--surface-floating",
    "--text-display-xl",
    "--space-4",
    "--radius-pill",
    "--motion-standard",
  ]) {
    assert.ok(css.includes(token), `${token} should exist`);
  }
});

test("Aura components expose accessible interaction foundations", () => {
  assert.match(ui, /role="switch"/);
  assert.match(ui, /aria-checked/);
  assert.match(ui, /role="radiogroup"/);
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
  assert.ok(showcase.includes("Lumeo Aura"));
  assert.ok(showcase.includes("Tool workspace foundations"));
  assert.ok(showcase.includes("Control Center guidance"));
  assert.doesNotMatch(showcase, /console\.(log|info|warn|error)/);
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
  assert.ok(pdfTools.includes("aura-directory-section"));
  assert.ok(publicChrome.includes("aura-public-nav"));
  assert.ok(publicFooter.includes("aura-public-footer"));
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
