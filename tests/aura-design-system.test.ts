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
