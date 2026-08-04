import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  decodePDFRawStream,
  PDFRawStream,
  PDFStream,
  PDFArray,
  PDFNumber,
  PDFHexString,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  pushGraphicsState,
  popGraphicsState,
  concatTransformationMatrix,
  beginText,
  endText,
  setFontAndSize,
  moveText,
} from "pdf-lib";
import { tokenizeContentStream, walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";

// Loads a saved PDF back and returns its first page's real, decoded (i.e.
// un-FlateDecode'd) content-stream bytes -- proven against pdf-lib's own
// object graph, not assumed.
async function decodedContentStreamBytes(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const loaded = await PDFDocument.load(pdfBytes);
  const page = loaded.getPages()[0];
  // Contents() is the public accessor (PDFPageLeaf.Contents()) and already
  // dereferences the ref for us -- per spec it can be either a single
  // stream or an array of streams, both handled below.
  const contents = page.node.Contents();
  const streamRefs = contents instanceof PDFArray ? Array.from({ length: contents.size() }, (_unused, i) => contents.get(i)) : [];
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? streamRefs.map((ref) => loaded.context.lookup(ref, PDFStream))
      : [contents as PDFStream];

  const parts = streams.map((stream) => {
    if (!(stream instanceof PDFRawStream)) {
      throw new Error("Expected a raw (undecoded) content stream.");
    }
    return decodePDFRawStream(stream).decode();
  });
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

test("tokenizeContentStream parses a real decoded stream's operators, strings, and numbers", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const bytes = await decodedContentStreamBytes(await doc.save());

  const tokens = tokenizeContentStream(bytes);
  const operatorNames = tokens.filter((t) => t.type === "operator").map((t) => t.value);

  assert.ok(operatorNames.includes("BT"));
  assert.ok(operatorNames.includes("ET"));
  assert.ok(operatorNames.includes("Tf"));
  assert.ok(operatorNames.includes("Tm"));
  assert.ok(operatorNames.includes("Tj"));

  const hexStringToken = tokens.find((t) => t.type === "hexString");
  assert.ok(hexStringToken, "expected the drawn text's hex string operand to be tokenized");
  if (hexStringToken?.type === "hexString") {
    assert.equal(Buffer.from(hexStringToken.value).toString("latin1"), "Hello World");
  }
});

test("walkTextShowOperators finds exactly one Tj with the right font size, string, and byte range", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello World", { x: 50, y: 700, size: 18, font });
  const bytes = await decodedContentStreamBytes(await doc.save());

  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 1);
  const [op] = operators;

  assert.equal(op.kind, "Tj");
  assert.equal(op.fontSizePt, 18);
  assert.equal(Buffer.from(op.strings[0]).toString("latin1"), "Hello World");

  // The unrotated page has an identity CTM, and the text was drawn with
  // Tm = [1,0,0,1,50,700] (from x:50,y:700) -- so the rendering matrix's
  // translation should land exactly there, and its scale should equal the
  // font size (Th defaults to 100%).
  assert.equal(op.textRenderingMatrix[4], 50);
  assert.equal(op.textRenderingMatrix[5], 700);
  assert.equal(op.textRenderingMatrix[0], 18);
  assert.equal(op.textRenderingMatrix[3], 18);

  // The byte range must slice out exactly this operator's own invocation,
  // nothing more and nothing less -- proves start/end are usable for a
  // later in-place replacement.
  const slice = Buffer.from(bytes.subarray(op.start, op.end)).toString("latin1");
  assert.equal(slice, "<48656C6C6F20576F726C64> Tj");
});

test("walkTextShowOperators tracks q/cm CTM changes into the rendering matrix", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // Draw inside a translated graphics state so the operator's real position
  // only comes out right if `cm` is actually applied to the CTM.
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, 100, 0));
  page.drawText("Shifted", { x: 0, y: 700, size: 12, font });
  page.pushOperators(popGraphicsState());
  const bytes = await decodedContentStreamBytes(await doc.save());

  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 1);
  // x=0 in an un-shifted CTM plus the 100pt cm translation should land at 100.
  assert.equal(operators[0].textRenderingMatrix[4], 100);
});

test("walkTextShowOperators handles TJ arrays (multiple string runs in one operator)", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // page.getFont()/page.fontKey are only typed as private in pdf-lib's
  // declarations (a mismatch with its actual runtime API) -- newFontDictionary
  // is the same public primitive setFont() itself calls internally to
  // register a font under a resource name and get that name back.
  const fontKey = page.node.newFontDictionary(font.name, font.ref);

  // PDFHexString.of takes raw hex digits directly -- fromText would encode
  // as UTF-16BE-with-BOM, which is right for PDF *text strings* (metadata)
  // but wrong here: a Tj/TJ operand is raw glyph-code bytes, and for this
  // simple non-embedded font those glyph codes are just ASCII.
  const tjArray = PDFArray.withContext(doc.context);
  tjArray.push(PDFHexString.of(Buffer.from("AB", "ascii").toString("hex")));
  tjArray.push(PDFNumber.of(-100));
  tjArray.push(PDFHexString.of(Buffer.from("CD", "ascii").toString("hex")));

  page.pushOperators(
    beginText(),
    setFontAndSize(fontKey, 14),
    moveText(50, 700),
    PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [tjArray]),
    endText(),
  );
  const bytes = await decodedContentStreamBytes(await doc.save());

  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 1);
  assert.equal(operators[0].kind, "TJ");
  assert.equal(operators[0].strings.length, 2);
  assert.equal(Buffer.from(operators[0].strings[0]).toString("latin1"), "AB");
  assert.equal(Buffer.from(operators[0].strings[1]).toString("latin1"), "CD");
});
