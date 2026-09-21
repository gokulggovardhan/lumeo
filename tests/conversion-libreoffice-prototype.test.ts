import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LibreOffice prototype is development-only and uses the shared pinned asset policy", async () => {
  const [source, assetConfig] = await Promise.all([
    readFile(
      "lib/conversion/browser/libreoffice/prototypeRuntime.ts",
      "utf8",
    ),
    readFile(
      "lib/conversion/browser/libreoffice/assetConfig.ts",
      "utf8",
    ),
  ]);

  assert.match(source, /process\.env\.NODE_ENV !== "development"/);
  assert.match(source, /resolveOfficeAssetConfig\("development"\)/);
  assert.match(assetConfig, /ZETAJS_HELPER_VERSION = "1\.2\.0"/);
  assert.match(source, /writer_pdf_Export/);
  assert.match(source, /crossOriginIsolated/);
  assert.match(source, /SharedArrayBuffer/);
});

test("prototype whole-file MEMFS copy is quarantined behind a small-file cap", async () => {
  const source = await readFile(
    "lib/conversion/browser/libreoffice/prototypeRuntime.ts",
    "utf8",
  );

  assert.match(source, /10 \* 1024 \* 1024/);
  assert.match(source, /file\.arrayBuffer\(\)/);
  assert.match(source, /development prototype/);
});

test("conversion lab route is unavailable in production builds", async () => {
  const source = await readFile("app/internal/conversion-lab/page.tsx", "utf8");

  assert.match(source, /process\.env\.NODE_ENV !== "development"/);
  assert.match(source, /notFound\(\)/);
});
