import assert from "node:assert/strict";
import test from "node:test";
import { scanForSensitiveInfo } from "../lib/pdf/edit/privacyShield.ts";
import type { DetectedTextRun } from "../lib/pdf/edit/textRuns.ts";

function makeRun(str: string): DetectedTextRun {
  return { str, fontName: "Helvetica", xPct: 10, yPct: 10, widthPct: 20, heightPct: 4, fontSizePt: 12, rotated: false };
}

test("scanForSensitiveInfo matches a currency amount", () => {
  const matches = scanForSensitiveInfo([makeRun("Total Amount : 1350.00")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "currency");
});

test("scanForSensitiveInfo matches a long structured digit sequence (account/service number)", () => {
  const matches = scanForSensitiveInfo([makeRun("6534501001928")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "account-number");
});

test("scanForSensitiveInfo matches a 10-digit phone number", () => {
  const matches = scanForSensitiveInfo([makeRun("9876543210")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].category, "phone");
});

test("scanForSensitiveInfo does not match ordinary short text", () => {
  const matches = scanForSensitiveInfo([makeRun("Thank You!"), makeRun("Circle Name"), makeRun("TIRUPATI")]);
  assert.equal(matches.length, 0);
});

test("scanForSensitiveInfo does not match a short 2-3 digit number (page numbers, division codes)", () => {
  const matches = scanForSensitiveInfo([makeRun("55"), makeRun("Division Code : 55")]);
  assert.equal(matches.length, 0);
});

test("scanForSensitiveInfo returns one match per matching run, preserving each run's own bounding box", () => {
  const runs = [makeRun("Thank You!"), { ...makeRun("1350.00"), xPct: 40, yPct: 20 }];
  const matches = scanForSensitiveInfo(runs);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].run.xPct, 40);
  assert.equal(matches[0].run.yPct, 20);
});

// Documents a known false-positive risk rather than claiming perfect
// accuracy -- see docs/superpowers/specs/2026-08-10-workspace-redesign-design.md's
// Testing section. A 10-digit number that ISN'T actually an account
// number (e.g. a long invoice line item) still matches "account-number":
// regex can't distinguish intent, only shape.
test("scanForSensitiveInfo known false-positive: any 10+ digit sequence matches, regardless of real meaning", () => {
  const matches = scanForSensitiveInfo([makeRun("Reference 1234567890 for tracking")]);
  assert.equal(matches.length, 1);
});
