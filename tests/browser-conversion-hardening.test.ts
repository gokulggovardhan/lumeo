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
    assert.match(source, /Cancel conversion/);
    assert.match(source, /cleanupOrphanedConversionJobs\(\)/);
    assert.match(source, /stage === "cancelled"/);
  }
});

test("PDF engine validates page count and maps protected-document errors", async () => {
  const [engine, errors] = await Promise.all([
    readFile("lib/conversion/browser/BrowserPdfToWordEngine.ts", "utf8"),
    readFile("lib/conversion/errors.ts", "utf8"),
  ]);

  assert.match(engine, /checkPdfPageCount/);
  assert.match(engine, /normalizeConversionError/);
  assert.match(engine, /hasLocalWorkspaceCapacity/);
  assert.match(errors, /encrypted-input/);
  assert.match(errors, /password\|encrypted/);
});

test("Word runtime cancellation preserves the runtime and removes temporary MEMFS files", async () => {
  const source = await readFile(
    "lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /\.Module\?\.PThread|terminateAllThreads/);
  assert.match(source, /does not expose a public worker termination API/);
  assert.match(source, /URL\.revokeObjectURL\(this\.officeThreadUrl\)/);
  assert.match(source, /helper\.FS\.unlink\(from\)/);
  assert.match(source, /helper\.FS\.unlink\(to\)/);
  assert.match(source, /onAbort/);
  assert.match(source, /waitForPromiseOrAbort/);
  assert.match(source, /if \(this\.ready \|\| this\.startPromise\) return/);
  assert.match(source, /runtime itself is retained and reused/);
});

test("conversion lab validates the immutable same-origin Office runtime", async () => {
  const source = await readFile(
    "components/internal/BrowserConversionLab.tsx",
    "utf8",
  );

  assert.match(source, /useState\(LUMEO_OFFICE_RUNTIME_ROUTE\)/);
  assert.match(source, /new URL\([\s\S]*window\.location\.origin/);
  assert.doesNotMatch(source, /DEV_ZETAOFFICE_BASE_URL/);
});


test("OPFS is a bounded abortable optimization with direct-file fallback", async () => {
  const [workspace, word, pdf] = await Promise.all([
    readFile("lib/conversion/browser/workspace.ts", "utf8"),
    readFile("lib/conversion/browser/BrowserWordToPdfEngine.ts", "utf8"),
    readFile("lib/conversion/browser/BrowserPdfToWordEngine.ts", "utf8"),
  ]);

  assert.match(workspace, /CONVERSION_WORKSPACE_SETUP_TIMEOUT_MS = 5_000/);
  assert.match(workspace, /CONVERSION_STORAGE_PROBE_TIMEOUT_MS = 2_000/);
  assert.match(workspace, /blob\.stream\(\)\.getReader\(\)/);
  assert.match(workspace, /await writable\.write\(value\)/);
  assert.doesNotMatch(workspace, /pipeTo\(writable/);
  assert.match(workspace, /void requestPersistentConversionStorage\(\)\.catch/);
  assert.match(workspace, /void cleanupOrphanedConversionJobs\(Date\.now\(\)\)\.catch/);
  assert.match(workspace, /throwIfWorkspaceAborted\(signal\)/);

  for (const engine of [word, pdf]) {
    assert.match(engine, /estimateLocalConversionStorage\(signal\)/);
    assert.match(engine, /mode !== "normal"/);
    assert.match(engine, /BrowserConversionWorkspace\.create\([\s\S]*signal/);
    assert.match(engine, /stageInput\(input\.file, signal\)/);
    assert.match(engine, /if \(signal\.aborted\) throw workspaceError/);
    assert.match(engine, /workspace = null/);
  }
});
