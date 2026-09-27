import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const destinationDir = path.join(root, "public", "tesseract");

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "core/tesseract-core-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm", "core/tesseract-core-simd-lstm.wasm"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm", "core/tesseract-core-relaxedsimd-lstm.wasm"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
  ["node_modules/tesseract.js/LICENSE.md", "licenses/tesseract-js-LICENSE.md"],
  ["node_modules/tesseract.js-core/LICENSE", "licenses/tesseract-js-core-LICENSE"],
  ["node_modules/@tesseract.js-data/eng/README.md", "licenses/eng-traineddata-README.md"],
];

await rm(destinationDir, { recursive: true, force: true });
await mkdir(destinationDir, { recursive: true });

const manifestFiles = [];
for (const [sourceRelative, destinationRelative] of files) {
  const source = path.join(root, sourceRelative);
  const destination = path.join(destinationDir, destinationRelative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
  const bytes = await readFile(destination);
  manifestFiles.push({
    path: destinationRelative,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const packageNames = [
  "tesseract.js",
  "tesseract.js-core",
  "@tesseract.js-data/eng",
];
const packages = {};
for (const name of packageNames) {
  const metadata = JSON.parse(
    await readFile(path.join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"),
  );
  packages[name] = metadata.version;
}

await writeFile(
  path.join(destinationDir, "manifest.json"),
  `${JSON.stringify(
    {
      generated: true,
      purpose: "Browser-local OCR runtime assets; contains no user document data",
      packages,
      files: manifestFiles,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Prepared ${manifestFiles.length} self-hosted OCR assets (${manifestFiles.reduce(
    (sum, file) => sum + file.bytes,
    0,
  )} bytes).`,
);
