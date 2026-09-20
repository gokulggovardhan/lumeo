#!/usr/bin/env bash
set -euo pipefail

SOURCE_BASE="${ZETAOFFICE_SOURCE_BASE_URL:-https://cdn.zetaoffice.net/zetaoffice_latest/}"
OUT_DIR="${1:-.tmp/zetaoffice-runtime}"

mkdir -p "$OUT_DIR"

files=(
  "soffice.js"
  "soffice.wasm"
  "soffice.data"
  "soffice.data.js.metadata"
)

for name in "${files[@]}"; do
  echo "Downloading $name"
  curl     --fail     --location     --retry 4     --retry-delay 5     --retry-all-errors     --compressed     "${SOURCE_BASE%/}/$name"     --output "$OUT_DIR/$name"
done

(
  cd "$OUT_DIR"
  sha256sum "${files[@]}" > SHA256SUMS
)

release_id="$(
  (
    cd "$OUT_DIR"
    cat SHA256SUMS
  ) | sha256sum | awk '{print substr($1,1,24)}'
)"

node --input-type=module - "$OUT_DIR" "$SOURCE_BASE" "$release_id" <<'NODE'
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const [outDir, sourceBase, releaseId] = process.argv.slice(2);
const files = [
  "soffice.js",
  "soffice.wasm",
  "soffice.data",
  "soffice.data.js.metadata",
];

const entries = [];
for (const name of files) {
  const fullPath = path.join(outDir, name);
  const [bytes, metadata] = await Promise.all([
    readFile(fullPath),
    stat(fullPath),
  ]);
  entries.push({
    name,
    bytes: metadata.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

await writeFile(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      releaseId,
      sourceBaseUrl: sourceBase,
      capturedAt: new Date().toISOString(),
      files: entries,
    },
    null,
    2,
  ) + "\n",
);
NODE

echo "$release_id" > "$OUT_DIR/RELEASE_ID"
echo "Immutable runtime release ID: $release_id"
