import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts, PDFName } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyRedaction } from "../lib/pdf/edit/applyRedaction.ts";
import {
  assessRedactionCoverage,
  boxesOverlap,
  findSensitiveMatches,
  maskBoxFor,
  passesLuhn,
  removeSpans,
  runsIntersectingBoxes,
} from "../lib/pdf/edit/redaction.ts";
import { scrubDocumentMetadata } from "../lib/pdf/edit/scrubMetadata.ts";
import { textRunsFromContent } from "../lib/pdf/edit/textRuns.ts";

// The single claim redaction makes: the characters are GONE from the file,
// not covered up. Everything else here supports that one assertion, which is
// made the only way it can honestly be made -- by reloading the output and
// asking a parser what text it can find.

async function sensitivePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Employee record", { x: 50, y: 700, size: 14, font });
  page.drawText("SSN 123-45-6789", { x: 50, y: 660, size: 14, font });
  page.drawText("Contact ada@example.com", { x: 50, y: 620, size: 14, font });
  doc.setAuthor("Ada Lovelace");
  doc.setTitle("Confidential personnel file");
  return doc.save();
}

/**
 * Drives the REAL pipeline (applyRedaction), not a copy of it. A test that
 * reimplements the thing under test proves the test's copy works, which is
 * the wrong thing to learn about a security feature.
 */
async function redact(bytes: Uint8Array, shouldRedact: (runText: string) => string | null) {
  const pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await pdfjsDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const runs = textRunsFromContent((await page.getTextContent()).items as never, viewport.transform, viewport.width, viewport.height);

  const targets = runs
    .map((run) => {
      const replacementText = shouldRedact(run.str);
      return replacementText === null ? null : { ...run, replacementText };
    })
    .filter((target): target is NonNullable<typeof target> => target !== null);

  const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const outcome = await applyRedaction(source, 0, targets, {
    width: viewport.width,
    height: viewport.height,
    transform: viewport.transform,
  });
  return { bytes: new Uint8Array(outcome.bytes), stripped: outcome.strippedRuns, unmatched: outcome.unremovedRuns, outcome };
}

async function extractedText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

test("a redacted SSN is not extractable from the output, and the surrounding words survive", async () => {
  const source = await sensitivePdf();
  assert.match(await extractedText(source), /123-45-6789/, "fixture should start with the SSN present");

  const { bytes, unmatched } = await redact(source, (runText) => {
    const matches = findSensitiveMatches(runText).filter((m) => m.kind === "ssn");
    return matches.length > 0 ? removeSpans(runText, matches) : null;
  });
  assert.deepEqual(unmatched, [], "the fixture's runs must all be strippable");

  const after = await extractedText(bytes);
  assert.doesNotMatch(after, /123-45-6789/, `SSN survived: ${JSON.stringify(after)}`);
  assert.doesNotMatch(after, /\d{3}-\d{2}-\d{4}/, "no SSN-shaped digits should remain");
  // Precision, not just removal: the label around it is untouched.
  assert.match(after, /SSN/);
  assert.match(after, /Employee record/);
});

// The digits must be gone from the FILE, not merely from what a text
// extractor chooses to report. Searching the raw bytes is the check that
// would catch an implementation that hid the text instead of deleting it.
test("the redacted digits do not appear anywhere in the saved bytes", async () => {
  const source = await sensitivePdf();
  const { bytes } = await redact(source, (runText) => {
    const matches = findSensitiveMatches(runText);
    return matches.length > 0 ? removeSpans(runText, matches) : null;
  });

  const haystack = Buffer.from(bytes).toString("latin1");
  assert.equal(haystack.includes("123-45-6789"), false, "SSN found in raw output bytes");
  assert.equal(haystack.includes("ada@example.com"), false, "email found in raw output bytes");
});

test("redaction removes the email too, leaving its label", async () => {
  const source = await sensitivePdf();
  const { bytes } = await redact(source, (runText) => {
    const matches = findSensitiveMatches(runText).filter((m) => m.kind === "email");
    return matches.length > 0 ? removeSpans(runText, matches) : null;
  });
  const after = await extractedText(bytes);
  assert.doesNotMatch(after, /ada@example\.com/);
  assert.match(after, /Contact/);
});

test("scrubDocumentMetadata clears the Info fields and reports what it cleared", async () => {
  const source = await sensitivePdf();
  const doc = await PDFDocument.load(source);
  assert.equal(doc.getAuthor(), "Ada Lovelace");

  const result = scrubDocumentMetadata(doc);
  const reloaded = await PDFDocument.load(await doc.save());
  assert.equal(reloaded.getAuthor(), "");
  assert.equal(reloaded.getTitle(), "");
  assert.ok(result.clearedInfoFields.includes("Author"));

  const raw = Buffer.from(await doc.save()).toString("latin1");
  assert.equal(raw.includes("Ada Lovelace"), false, "author name still present in output");
});

// Clearing /Info is the easy half. A file written by a real authoring tool
// repeats the author in an XMP packet, and a scrub that leaves it behind
// still hands over the name in plain text.
test("scrubDocumentMetadata removes the XMP packet, not just the Info dictionary", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  const xmp = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>Ada Lovelace</dc:creator></x:xmpmeta><?xpacket end="w"?>`;
  const stream = doc.context.flateStream(new TextEncoder().encode(xmp));
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(stream));
  assert.ok(doc.catalog.get(PDFName.of("Metadata")) !== undefined);

  const result = scrubDocumentMetadata(doc);
  assert.equal(result.removedXmp, true);
  assert.equal(doc.catalog.get(PDFName.of("Metadata")), undefined);

  const raw = Buffer.from(await doc.save()).toString("latin1");
  assert.equal(raw.includes("xpacket"), false, "XMP packet survived the save");
});

test("scrubDocumentMetadata reports removedXmp false when there was none", async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  assert.equal(scrubDocumentMetadata(doc).removedXmp, false);
});

// --- detectors -----------------------------------------------------------

test("findSensitiveMatches finds SSNs, emails and IBANs with their offsets", () => {
  const text = "SSN 123-45-6789 mail ada@example.com iban GB82WEST12345698765432 end";
  const kinds = findSensitiveMatches(text).map((m) => m.kind);
  assert.deepEqual(kinds.sort(), ["email", "iban", "ssn"]);

  const ssn = findSensitiveMatches(text).find((m) => m.kind === "ssn")!;
  assert.equal(text.slice(ssn.start, ssn.end), "123-45-6789");
});

// The never-issued ranges. Without these exclusions any 3-2-4 digit group
// reads as an SSN, and part numbers get redacted out of engineering drawings.
test("findSensitiveMatches rejects digit groups that cannot be real SSNs", () => {
  for (const notSsn of ["000-45-6789", "666-45-6789", "900-45-6789", "123-00-6789", "123-45-0000"]) {
    const found = findSensitiveMatches(notSsn).filter((m) => m.kind === "ssn");
    assert.deepEqual(found, [], `${notSsn} should not read as an SSN`);
  }
});

// A detector that flags every long number trains people to skim the review
// step, which is how a real SSN gets waved through.
test("credit-card detection is Luhn-checked, so arbitrary long numbers are not flagged", () => {
  assert.equal(passesLuhn("4539578763621486"), true);
  assert.equal(passesLuhn("4539578763621487"), false);

  const flagged = findSensitiveMatches("invoice 1234567890123456 total").filter((m) => m.kind === "credit-card");
  assert.deepEqual(flagged, [], "a non-Luhn number should not be flagged as a card");

  const real = findSensitiveMatches("card 4539 5787 6362 1486 exp").filter((m) => m.kind === "credit-card");
  assert.equal(real.length, 1);
});

// Overlapping spans would corrupt the offsets removeSpans works from.
test("findSensitiveMatches never returns two matches claiming the same characters", () => {
  const matches = findSensitiveMatches("call +1 (555) 123-4567 or mail a@b.co now");
  for (let i = 1; i < matches.length; i += 1) {
    assert.ok(matches[i].start >= matches[i - 1].end, `matches overlap: ${JSON.stringify(matches)}`);
  }
});

test("removeSpans deletes only the matched characters, applied back to front", () => {
  const text = "SSN 123-45-6789 and mail ada@example.com.";
  const out = removeSpans(text, findSensitiveMatches(text));
  assert.doesNotMatch(out, /123-45-6789/);
  assert.doesNotMatch(out, /ada@example\.com/);
  assert.match(out, /^SSN {2}and mail \.$/);
});

test("removeSpans ignores spans outside the string rather than corrupting it", () => {
  assert.equal(removeSpans("abc", [{ start: 10, end: 20 }]), "abc");
  assert.equal(removeSpans("abc", [{ start: 2, end: 1 }]), "abc");
});

// --- geometry ------------------------------------------------------------

test("boxesOverlap is false for merely touching edges", () => {
  const a = { xPct: 0, yPct: 0, widthPct: 10, heightPct: 10 };
  assert.equal(boxesOverlap(a, { xPct: 10, yPct: 0, widthPct: 10, heightPct: 10 }), false);
  assert.equal(boxesOverlap(a, { xPct: 9.9, yPct: 0, widthPct: 10, heightPct: 10 }), true);
});

// Over-redaction is the safe direction: a clipped run has no per-glyph
// geometry to decide from, so the whole run goes.
test("runsIntersectingBoxes includes a run the box only clips", () => {
  const runs = [
    { str: "clipped", xPct: 5, yPct: 5, widthPct: 20, heightPct: 3 },
    { str: "elsewhere", xPct: 60, yPct: 60, widthPct: 20, heightPct: 3 },
  ];
  const hit = runsIntersectingBoxes(runs, [{ xPct: 20, yPct: 4, widthPct: 5, heightPct: 5 }]);
  assert.deepEqual(hit.map((r) => r.str), ["clipped"]);
});

test("maskBoxFor covers the whole run even when the drawn box is smaller", () => {
  const run = { xPct: 10, yPct: 10, widthPct: 30, heightPct: 4 };
  const mask = maskBoxFor(run, [{ xPct: 12, yPct: 11, widthPct: 5, heightPct: 2 }]);
  assert.ok(mask.xPct < run.xPct);
  assert.ok(mask.yPct < run.yPct);
  assert.ok(mask.xPct + mask.widthPct > run.xPct + run.widthPct);
  assert.ok(mask.yPct + mask.heightPct > run.yPct + run.heightPct);
});

test("maskBoxFor stays inside the page for a run at the very edge", () => {
  const mask = maskBoxFor({ xPct: 0, yPct: 0, widthPct: 5, heightPct: 2 }, []);
  assert.ok(mask.xPct >= 0);
  assert.ok(mask.yPct >= 0);
});

// --- honesty about what was not removed ----------------------------------

test("coverage is incomplete when a targeted run could not be stripped", () => {
  const assessment = assessRedactionCoverage({
    targetedRuns: [{ str: "a" }, { str: "b" }],
    strippedRuns: [{ str: "a" }],
    unmatchedRuns: [{ str: "b" }],
    multiOperatorRuns: [],
    pageHasImages: false,
  });
  assert.equal(assessment.complete, false);
  assert.equal(assessment.warnings.length, 1);
});

// A black rectangle over a scanned page is a rectangle over a photograph.
// This must be surfaced, never assumed understood.
test("coverage is incomplete when the page carries an image, even if every run was stripped", () => {
  const assessment = assessRedactionCoverage({
    targetedRuns: [{ str: "a" }],
    strippedRuns: [{ str: "a" }],
    unmatchedRuns: [],
    multiOperatorRuns: [],
    pageHasImages: true,
  });
  assert.equal(assessment.complete, false);
  assert.deepEqual(assessment.warnings, [{ kind: "page-has-images" }]);
});

test("coverage is complete only when everything targeted was stripped and nothing was flagged", () => {
  const assessment = assessRedactionCoverage({
    targetedRuns: [{ str: "a" }],
    strippedRuns: [{ str: "a" }],
    unmatchedRuns: [],
    multiOperatorRuns: [],
    pageHasImages: false,
  });
  assert.equal(assessment.complete, true);
  assert.deepEqual(assessment.warnings, []);
});
