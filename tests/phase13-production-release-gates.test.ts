import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("real production Firefox Office errors terminate capability polling without pretending a conversion succeeded", () => {
  const spec = source("e2e/production-conversion-certification.spec.ts");
  assert.match(spec, /"ready" \| "unsupported" \| "recoverable" \| "waiting"/);
  assert.match(spec, /"Retry engine"/);
  assert.match(spec, /if \(retryEngine\) return "recoverable"/);
  assert.match(spec, /capabilityOutcome === "unsupported"/);
  assert.match(spec, /The local conversion engine could not be loaded/);
  assert.match(spec, /Check your connection and try again/);
  assert.match(spec, /await expect\(page\.getByText\("PDF ready"\)\)\.toBeVisible/);
  assert.doesNotMatch(spec, /test\.skip\(browserName === "firefox"/);
});

test("WebKit Admin security probe retains literal confirm dialog and accessible keyboard activation", () => {
  const spec = source("e2e/admin-auth.spec.ts");
  assert.match(spec, /maintenanceForm\.evaluate\(\(form: HTMLFormElement\) => form\.requestSubmit\(\)\)/);
  assert.match(spec, /maintenanceSaveAfterCancel\.press\("Enter"\)/);
  assert.match(spec, /await expect\(reenabledConfirmation\)\.toBeVisible\(\)/);
  assert.match(spec, /reenabledConfirmation\.getByRole\("button", \{ name: "Enable maintenance mode" \}\)\.click\(\)/);
});
