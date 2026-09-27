import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEST = path.join(ROOT, "public", "ocr");
const NODE_MODULES = path.join(ROOT, "node_modules");

const assets = [
  {
    source: path.join(NODE_MODULES, "tesseract.js", "dist", "worker.min.js"),
    target: path.join("tesseract", "worker.min.js"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-lstm.wasm.js"),
    target: path.join("tesseract-core", "tesseract-core-lstm.wasm.js"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-lstm.wasm"),
    target: path.join("tesseract-core", "tesseract-core-lstm.wasm"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-simd-lstm.wasm.js"),
    target: path.join("tesseract-core", "tesseract-core-simd-lstm.wasm.js"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-simd-lstm.wasm"),
    target: path.join("tesseract-core", "tesseract-core-simd-lstm.wasm"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
    target: path.join("tesseract-core", "tesseract-core-relaxedsimd-lstm.wasm.js"),
  },
  {
    source: path.join(NODE_MODULES, "tesseract.js-core", "tesseract-core-relaxedsimd-lstm.wasm"),
    target: path.join("tesseract-core", "tesseract-core-relaxedsimd-lstm.wasm"),
  },
  {
    source: path.join(
      NODE_MODULES,
      "@tesseract.js-data",
      "eng",
      "4.0.0_best_int",
      "eng.traineddata.gz",
    ),
    target: path.join("tessdata", "eng.traineddata.gz"),
  },
];

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex");
}

await rm(DEST, { recursive: true, force: true });
await mkdir(DEST, { recursive: true });

const manifest = {
  version: 1,
  tesseractJs: "7.0.0",
  englishModel: "@tesseract.js-data/eng@1.0.0/4.0.0_best_int",
  engine: "LSTM_ONLY",
  assets: [],
};

for (const asset of assets) {
  const info = await stat(asset.source);
  if (!info.isFile() || info.size <= 0) {
    throw new Error(`OCR asset is missing or empty: ${asset.source}`);
  }
  const target = path.join(DEST, asset.target);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(asset.source, target);
  manifest.assets.push({
    path: `/ocr/${asset.target.split(path.sep).join("/")}`,
    bytes: info.size,
    sha256: await sha256(asset.source),
  });
}

await writeFile(
  path.join(DEST, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8",
);

const totalBytes = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
console.log(
  `Prepared ${manifest.assets.length} self-hosted OCR assets (${(
    totalBytes /
    1024 /
    1024
  ).toFixed(2)} MiB).`,
);
