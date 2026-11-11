import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Merge PDF and Compress PDF share the exact same background compression engine", () => {
  const merge = readFileSync("components/pdf/MergePdfTool.tsx", "utf8");
  const compress = readFileSync("components/pdf/CompressPdfTool.tsx", "utf8");
  const client = readFileSync("lib/pdf/optimization/compressionWorkerClient.ts", "utf8");
  const worker = readFileSync("lib/pdf/optimization/compression.worker.ts", "utf8");
  const pipeline = readFileSync("lib/pdf/optimization/compressionPipeline.ts", "utf8");

  for (const component of [merge, compress]) {
    assert.match(component, /import \{ compressPdfInBackground \} from ["']@\/lib\/pdf\/optimization\/compressionWorkerClient["']/);
    assert.match(component, /await compressPdfInBackground\(/);
  }
  assert.match(client, /new Worker\(new URL\("\.\/compression\.worker\.ts", import\.meta\.url\)/);
  assert.match(worker, /runNativeCompression/);
  assert.match(pipeline, /searchNativePdfTarget/);
  assert.match(pipeline, /optimizeNativePdfImages/);
  assert.match(pipeline, /transcodeJpegInWorker/);
  assert.match(merge, /validatePdfOutput\(mergedBuffer, merged\.pageCount\)/);
  assert.match(compress, /validatePdfOutput\(outputBuffer, analysis\.pageCount\)/);
});

test("native merge defaults to original-quality and never silently forces image degradation", () => {
  const merge = readFileSync("components/pdf/MergePdfTool.tsx", "utf8");
  assert.match(merge, /useState<"none" \| "recommended" \| "maximum" \| "target">\("none"\)/);
  assert.match(merge, /mergeCompression !== "none"/);
  assert.match(merge, /Custom target size/);
  assert.match(merge, /Target not reached/);
});

test("both tools expose actual background progress and allow cancellation", () => {
  const merge = readFileSync("components/pdf/MergePdfTool.tsx", "utf8");
  const compress = readFileSync("components/pdf/CompressPdfTool.tsx", "utf8");
  const client = readFileSync("lib/pdf/optimization/compressionWorkerClient.ts", "utf8");
  assert.match(merge, /PDF merge progress/);
  assert.match(compress, /PDF compression progress/);
  assert.match(merge, /cancelMerge/);
  assert.match(compress, /compressionAbortRef\.current\?\.abort\(\)/);
  assert.match(client, /worker\.terminate\(\)/);
  assert.match(client, /AbortError/);
  const mergeClient = readFileSync("lib/pdf/merge/mergeWorkerClient.ts", "utf8");
  const nativeMerge = readFileSync("lib/pdf/merge/nativeMerge.ts", "utf8");
  assert.match(mergeClient, /mergeNativeDocuments\(inputs, \{ \.\.\.options, signal, onProgress \}\)/);
  assert.match(nativeMerge, /assertMergeActive\(options\.signal\)/);
});

