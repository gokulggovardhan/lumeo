import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateErrorRate,
  characterErrorRate,
  levenshtein,
  normalizeText,
  toCharacters,
  toWords,
  wordErrorRate,
} from "../bench/ocr-gate2/evaluate.ts";

// The arithmetic that decides whether OCR is accurate enough to ship. The
// harness around it is slow and environment-dependent; this part has to be
// provably right, because a wrong CER does not fail loudly -- it quietly
// reports a number someone then makes a decision on.

test("levenshtein counts the three edit kinds", () => {
  assert.equal(levenshtein([..."kitten"], [..."sitting"]), 3);
  assert.equal(levenshtein([..."abc"], [..."abc"]), 0);
  assert.equal(levenshtein([..."abc"], [...""]), 3);
  assert.equal(levenshtein([...""], [..."abc"]), 3);
});

test("CER is edits over the REFERENCE length, not the hypothesis length", () => {
  // One substitution in a 5-character reference.
  const rate = characterErrorRate("hello", "hallo");
  assert.equal(rate.edits, 1);
  assert.equal(rate.referenceLength, 5);
  assert.equal(rate.rate, 0.2);
});

// A clamp at 1.0 would make a catastrophic result -- OCR hallucinating a
// page of text onto a nearly blank scan -- indistinguishable from a merely
// bad one. The number has to be allowed to exceed 1.
test("CER above 1.0 is reported, not clamped", () => {
  const rate = characterErrorRate("hi", "hi there everyone");
  assert.ok(rate.rate > 1, `expected >1, got ${rate.rate}`);
});

test("WER scores whole words, so one wrong word is one edit however long it is", () => {
  const rate = wordErrorRate("total amount due", "total amonut due");
  assert.equal(rate.edits, 1);
  assert.equal(rate.referenceLength, 3);
});

// The reason normalisation is not optional: Tesseract emits NFC, hand- or
// PDF-sourced ground truth can be NFD. Without normalising, text that is
// canonically identical scores as wrong.
test("NFC normalisation stops decomposed accents counting as errors", () => {
  const composed = "café";           // e-acute as one code point
  const decomposed = "café";   // e + combining acute
  assert.notEqual(composed, decomposed);
  assert.equal(characterErrorRate(composed, decomposed).rate, 0);
  assert.equal(wordErrorRate(composed, decomposed).rate, 0);
});

test("NFD is available for corpora that are canonically decomposed", () => {
  assert.equal(characterErrorRate("café", "café", { form: "NFD" }).rate, 0);
});

// Line breaks and column padding are layout, not recognition errors: the
// same words in the same order should score 0 regardless of how the page
// spaced them.
test("whitespace differences do not count as errors by default", () => {
  assert.equal(characterErrorRate("Total  Amount\n1350.00", "Total Amount 1350.00").rate, 0);
});

test("case is a real error unless explicitly ignored", () => {
  assert.ok(characterErrorRate("Total", "total").rate > 0);
  assert.equal(characterErrorRate("Total", "total", { ignoreCase: true }).rate, 0);
});

// Indexing by UTF-16 unit would split a surrogate pair into two "characters"
// that can never match, scoring errors against text that is correct.
test("characters are counted by code point, not UTF-16 unit", () => {
  const withAstral = "a\u{1D400}b"; // MATHEMATICAL BOLD CAPITAL A
  assert.equal(withAstral.length, 4);
  assert.equal(toCharacters(withAstral).length, 3);
  assert.equal(characterErrorRate(withAstral, withAstral).rate, 0);
});

test("toWords treats an empty or whitespace-only string as no words", () => {
  assert.deepEqual(toWords("   "), []);
  assert.deepEqual(toWords("a  b\tc"), ["a", "b", "c"]);
});

test("normalizeText collapses and trims by default", () => {
  assert.equal(normalizeText("  a \n b  "), "a b");
});

// An unweighted mean of per-fixture rates lets a tiny fixture that scored
// 1.0 outweigh a full page that scored 0.01. Aggregation has to pool the
// edits and the reference lengths.
test("aggregate is weighted by reference length, not a mean of rates", () => {
  const tiny = characterErrorRate("ab", "xy");        // rate 1.0 over 2 chars
  const page = characterErrorRate("a".repeat(198), "a".repeat(198)); // rate 0 over 198
  const naiveMean = (tiny.rate + page.rate) / 2;
  const pooled = aggregateErrorRate([tiny, page]);

  assert.equal(naiveMean, 0.5);
  assert.equal(pooled.edits, 2);
  assert.equal(pooled.referenceLength, 200);
  assert.equal(pooled.rate, 0.01);
});

test("aggregate of an empty set is zero rather than NaN", () => {
  assert.equal(aggregateErrorRate([]).rate, 0);
});
