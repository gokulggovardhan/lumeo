import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hasLocalWorkspaceCapacity,
} from "../lib/conversion/browser/workspace.ts";

test("workspace capacity policy falls back gracefully when quota is unknown", () => {
  assert.equal(
    hasLocalWorkspaceCapacity(
      {
        supported: false,
        quotaBytes: null,
        usageBytes: null,
        availableBytes: null,
      },
      500_000_000,
    ),
    true,
  );
});

test("workspace capacity policy rejects staging when known free space is too small", () => {
  assert.equal(
    hasLocalWorkspaceCapacity(
      {
        supported: true,
        quotaBytes: 1_000,
        usageBytes: 900,
        availableBytes: 100,
      },
      101,
    ),
    false,
  );
});

test("both conversion tools expose cancellation and visit cleanup", async () => {
  const [word, pdf] = await Promise.all([
    readFile("components/pdf/WordToPdfTool.tsx", "utf8"),
    readFile("components/pdf/PdfToWordTool.tsx", "utf8"),
  ]);

  for (const source of [word, pdf]) {
    assert.match(source, /abortRef\.current\?\.abort\(\)/);
    assert.match(source, /function handleCancel\(\)/);
    assert.match(source, />\s*Cancel\s*</);
    assert.match(source, /cleanupOrphanedConversionJobs\(\)/);
  }
});

test("PDF engine validates page count and maps protected-document errors", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserPdfToWordEngine.ts",
    "utf8",
  );

  assert.match(source, /checkPdfPageCount/);
  assert.match(source, /password-protected/);
  assert.match(source, /hasLocalWorkspaceCapacity/);
});
