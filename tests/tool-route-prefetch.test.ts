import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

test("heavy public tool navigation does not eagerly prefetch tool bundles", () => {
  const launcher = read("components/pdf/PdfToolLauncher.tsx");
  const explorer = read("components/tools/ToolsExplorer.tsx");
  const continueWorking = read("components/ContinueWorking.tsx");
  const aura = read("components/ui/Aura.tsx");
  const home = read("app/page.tsx");

  assert.match(
    launcher,
    /href=\{tile\.route\}[\s\S]{0,120}prefetch=\{false\}/,
  );
  assert.match(
    explorer,
    /href=\{tool\.route\}[\s\S]{0,120}prefetch=\{false\}/,
  );
  assert.match(
    continueWorking,
    /href=\{tile\.route\}[\s\S]{0,120}prefetch=\{false\}/,
  );

  const sharedToolLinks =
    aura.match(/href=\{tool\.route\}[\s\S]{0,120}prefetch=\{false\}/g) ?? [];
  assert.ok(sharedToolLinks.length >= 2, "shared tool-card links must disable eager prefetch");

  assert.match(home, /href="\/pdf"[\s\S]{0,120}prefetch=\{false\}/);
  assert.match(home, /href="\/pdf-tools"[\s\S]{0,120}prefetch=\{false\}/);
});
