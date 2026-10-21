import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = readFileSync("app/layout.tsx", "utf8");

test("public sans typography uses system-ui without a render-blocking Inter download", () => {
  assert.doesNotMatch(root, /\bInter\s*\(/);
  assert.match(root, /"--font-manrope": "system-ui"/);
  assert.match(root, /const fraunces = Fraunces\(\{[\s\S]*?display: "optional"/);
  assert.match(root, /const plexMono = IBM_Plex_Mono\(\{[\s\S]*?display: "swap",[\s\S]*?preload: false/);
  assert.match(root, /font-dm-serif/);
  assert.match(root, /font-ibm-plex-mono/);
});
