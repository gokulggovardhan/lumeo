import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = readFileSync("app/layout.tsx", "utf8");

test("primary fonts use optional loading to avoid slow mobile LCP repaint", () => {
  assert.match(root, /const inter = Inter\(\{[\s\S]*?display: "optional"/);
  assert.match(root, /const fraunces = Fraunces\(\{[\s\S]*?display: "optional"/);
  assert.match(root, /const plexMono = IBM_Plex_Mono\(\{/);
  assert.match(root, /font-manrope/);
  assert.match(root, /font-dm-serif/);
  assert.match(root, /display: "swap",[\s\S]*?preload: false/);
});
