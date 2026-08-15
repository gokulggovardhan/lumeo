// bench/ocr-gate2/setupAssets.ts
//
// Fetches the one asset the harness cannot generate -- the English language
// model -- into bench/ocr-gate2/assets/tessdata/, so the benchmark itself
// runs with every path pointed at local disk.
//
// This is the ONLY step that touches the network, it is explicit, and it is
// separate from the benchmark on purpose: the run must be able to prove it
// made zero external requests (see run.ts's fetch guard), which it cannot
// do if it might download something on a cache miss.
//
//   node --no-warnings --experimental-strip-types bench/ocr-gate2/setupAssets.ts

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TESSDATA_DIR = path.join(HERE, "assets", "tessdata");
export const LANG = "eng";
export const TRAINEDDATA_FILE = path.join(TESSDATA_DIR, `${LANG}.traineddata.gz`);

// The `4.0.0_best_int` variant is what tesseract.js resolves by default for
// LSTM-only recognition -- pinned explicitly so the model cannot change
// under the benchmark and silently move every error rate.
const SOURCE_URL = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${LANG}/4.0.0_best_int/${LANG}.traineddata.gz`;

export async function assetsPresent(): Promise<boolean> {
  try {
    const info = await stat(TRAINEDDATA_FILE);
    return info.size > 1_000_000;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (await assetsPresent()) {
    console.log(`already present: ${TRAINEDDATA_FILE}`);
    return;
  }
  await mkdir(TESSDATA_DIR, { recursive: true });
  console.log(`downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(TRAINEDDATA_FILE, bytes);
  console.log(`wrote ${TRAINEDDATA_FILE} (${(bytes.byteLength / 1048576).toFixed(2)} MB)`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("setupAssets.ts")) {
  await main();
}
