import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  checkBrowserConversionFileSize,
  MAX_BROWSER_CONVERSION_FILE_BYTES,
} from "../lib/conversion/limits.ts";

test("browser conversion input limit is 250 MB", () => {
  assert.equal(MAX_BROWSER_CONVERSION_FILE_BYTES, 250 * 1024 * 1024);
  const tooLarge = { size: MAX_BROWSER_CONVERSION_FILE_BYTES + 1 } as File;
  assert.match(checkBrowserConversionFileSize(tooLarge) ?? "", /250 MB/);
});

test("Word to PDF browser engine uses OPFS staging and browser LibreOffice", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
    "utf8",
  );
  assert.match(source, /BrowserConversionWorkspace/);
  assert.match(source, /getBrowserLibreOfficeRuntime/);
  assert.match(source, /processingLocation = "browser"/);
  assert.doesNotMatch(source, /fetch\("\/api\/tools\/word-to-pdf/);
  assert.doesNotMatch(source, /supabase/i);
});

test("browser LibreOffice runtime streams file bytes instead of arrayBuffer", async () => {
  const source = await readFile(
    "lib/conversion/browser/libreoffice/BrowserLibreOfficeRuntime.ts",
    "utf8",
  );
  assert.match(source, /source\.stream\(\)\.getReader\(\)/);
  assert.match(source, /fs\.write/);
  assert.match(source, /fs\.read/);
  assert.doesNotMatch(source, /file\.arrayBuffer\(\)/);
});

test("Word to PDF route is cross-origin isolated for SharedArrayBuffer", async () => {
  const source = await readFile("next.config.ts", "utf8");
  assert.match(source, /\/pdf\/word-to-pdf\/:path\*/);
  assert.match(source, /Cross-Origin-Opener-Policy/);
  assert.match(source, /Cross-Origin-Embedder-Policy/);
});


test("Word to PDF resolves the production Office runtime only when conversion starts", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
    "utf8",
  );
  assert.match(source, /private getRuntime\(\)/);
  assert.match(source, /this\.injectedRuntime \?\? getBrowserLibreOfficeRuntime\(\)/);
  assert.doesNotMatch(
    source,
    /private readonly runtime\s*=\s*getBrowserLibreOfficeRuntime\(\)/,
  );
});


test("Word engine reuses the page runtime and leaves job cleanup to the runtime", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
    "utf8",
  );

  assert.doesNotMatch(source, /runtime\.destroy\(\)/);
  assert.doesNotMatch(source, /let completed = false/);
});


test("Word to PDF repairs client-navigation isolation before capability checks", async () => {
  const [tool, isolation] = await Promise.all([
    readFile("components/pdf/WordToPdfTool.tsx", "utf8"),
    readFile("lib/conversion/browser/wordToPdfIsolation.ts", "utf8"),
  ]);

  assert.match(tool, /ensureWordToPdfCrossOriginIsolation\(\)/);
  assert.match(isolation, /window\.location\.reload\(\)/);
  assert.match(isolation, /sessionStorage/);
  assert.match(isolation, /crossOriginIsolated/);
});

test("Word to PDF prepares the real local Office runtime before enabling conversion", async () => {
  const source = await readFile("components/pdf/WordToPdfTool.tsx", "utf8");

  assert.match(source, /validateWordConversionFile\(file\)/);
  assert.match(source, /detectBrowserConversionCapabilities\(\)/);
  assert.match(source, /getBrowserLibreOfficeRuntime\(\)/);
  assert.match(source, /await runtime\.start\(controller\.signal\)/);
  assert.match(source, /setStatusLabel\("Ready to convert"\)/);
  assert.match(source, /if \(!selected \|\| isBusy \|\| !engineReady\) return/);
});

test("Word to PDF capability errors identify actual missing runtime features", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
    "utf8",
  );

  assert.match(source, /missingThreadedBrowserOfficeCapabilities/);
  assert.match(source, /Threaded browser Office conversion missing:/);
  assert.match(source, /worker OffscreenCanvas WebGL/);
});
