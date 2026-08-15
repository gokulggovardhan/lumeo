import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CORPUS_CLASSES, GroundTruthError, groundTruthSchema, loadGroundTruth } from "../bench/ocr-gate2/groundTruth.ts";
import { CORPUS_DOCUMENTS, groundTruthTextFor } from "../bench/ocr-gate2/documents.ts";

const GROUND_TRUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "bench", "ocr-gate2", "ground-truth");

// Ground truth is the thing every error rate is measured against. A
// malformed truth file does not crash the benchmark -- it silently produces
// a wrong CER that someone then makes a decision on. These run in the normal
// suite (no images, no Tesseract) so that failure mode is caught in CI.

test("every committed ground-truth file validates against the schema", async () => {
  const truths = await loadGroundTruth(GROUND_TRUTH_DIR);
  assert.equal(truths.length, CORPUS_DOCUMENTS.length * CORPUS_CLASSES.length);
});

test("ground truth matches the documents it was generated from", async () => {
  const truths = await loadGroundTruth(GROUND_TRUTH_DIR);
  for (const document of CORPUS_DOCUMENTS) {
    const expected = groundTruthTextFor(document);
    const forDocument = truths.filter((t) => t.id.endsWith(`--${document.id}`));
    assert.equal(forDocument.length, CORPUS_CLASSES.length, `${document.id} should appear in every class`);
    // All three classes render the SAME text, which is what makes a
    // difference in error rate attributable to the degradation alone.
    for (const truth of forDocument) {
      assert.equal(truth.text, expected, `${truth.id} drifted from documents.ts`);
    }
  }
});

test("every class carries a fixture for every document", async () => {
  const truths = await loadGroundTruth(GROUND_TRUTH_DIR);
  for (const corpusClass of CORPUS_CLASSES) {
    const inClass = truths.filter((t) => t.corpusClass === corpusClass);
    assert.equal(inClass.length, CORPUS_DOCUMENTS.length, `${corpusClass} is missing fixtures`);
  }
});

// The distinction that keeps the report honest: a degraded fixture must say
// so, and say what was done to it, or a reader could mistake a simulated
// phone photo for a real one.
test("degraded fixtures declare their origin and their degradations", async () => {
  const truths = await loadGroundTruth(GROUND_TRUTH_DIR);
  for (const truth of truths) {
    if (truth.corpusClass === "class-a-clean") {
      assert.equal(truth.origin, "synthetic");
      continue;
    }
    assert.equal(truth.origin, "synthetic-degraded", `${truth.id} should be marked as degraded`);
    assert.ok(truth.degradations.length > 0, `${truth.id} should list what was applied`);
  }
});

test("the schema rejects an entry missing its text", () => {
  const result = groundTruthSchema.safeParse({
    id: "x",
    corpusClass: "class-a-clean",
    image: "x.png",
    origin: "synthetic",
  });
  assert.equal(result.success, false);
});

test("the schema rejects an unknown corpus class", () => {
  const result = groundTruthSchema.safeParse({
    id: "x",
    corpusClass: "class-d-handwriting",
    image: "x.png",
    text: "hello",
    origin: "synthetic",
  });
  assert.equal(result.success, false);
});

test("loadGroundTruth reports the offending file, not just that something failed", async () => {
  await assert.rejects(
    () => loadGroundTruth(path.join(GROUND_TRUTH_DIR, "does-not-exist")),
    (error: Error) => error instanceof GroundTruthError || "code" in error,
  );
});
