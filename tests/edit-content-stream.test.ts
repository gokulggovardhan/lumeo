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

test("tokenizeContentStream does not depend on Node Buffer in browser code", () => {
  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: typeof Buffer;
  };
  const originalBuffer = globalWithBuffer.Buffer;

  try {
    Reflect.deleteProperty(globalWithBuffer, "Buffer");

    const tokens = tokenizeContentStream(
      new TextEncoder().encode("1 0 0 1 50.25 700 Tm"),
    );
    const numbers = tokens
      .filter((token) => token.type === "number")
      .map((token) => token.value);

    assert.deepEqual(numbers, [1, 0, 0, 1, 50.25, 700]);
    assert.equal(
      tokens.some(
        (token) => token.type === "operator" && token.value === "Tm",
      ),
      true,
    );
  } finally {
    if (originalBuffer) {
      globalWithBuffer.Buffer = originalBuffer;
    }
  }
});

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


test("walkTextShowOperators tracks fill/stroke colour and q/Q restoration without raster guessing", () => {
  const bytes = new TextEncoder().encode(
    "0.1 0.2 0.3 rg 0.8 G BT /F1 12 Tf 1 0 0 1 10 700 Tm (A) Tj ET " +
    "q 0.75 g 1 0 0 RG BT /F1 12 Tf 1 0 0 1 10 680 Tm (B) Tj ET Q " +
    "BT /F1 12 Tf 1 0 0 1 10 660 Tm (C) Tj ET",
  );
  const operators = walkTextShowOperators(bytes);
  assert.equal(operators.length, 3);

  assert.deepEqual(operators[0].fillColor, {
    colorSpace: "DeviceRGB",
    components: [0.1, 0.2, 0.3],
    cssHex: "#1a334d",
  });
  assert.deepEqual(operators[0].strokeColor, {
    colorSpace: "DeviceGray",
    components: [0.8],
    cssHex: "#cccccc",
  });

  assert.deepEqual(operators[1].fillColor, {
    colorSpace: "DeviceGray",
    components: [0.75],
    cssHex: "#bfbfbf",
  });
  assert.deepEqual(operators[1].strokeColor, {
    colorSpace: "DeviceRGB",
    components: [1, 0, 0],
    cssHex: "#ff0000",
  });

  assert.deepEqual(operators[2].fillColor, operators[0].fillColor);
  assert.deepEqual(operators[2].strokeColor, operators[0].strokeColor);
  assert.equal(operators[2].fillOpacity, 1);
  assert.equal(operators[2].strokeOpacity, 1);
});

test("walkTextShowOperators resolves ExtGState alpha only through a trusted resource resolver", () => {
  const bytes = new TextEncoder().encode(
    "/GSalpha gs BT /F1 12 Tf 1 0 0 1 10 700 Tm (Alpha) Tj ET",
  );

  const resolved = walkTextShowOperators(bytes, undefined, {
    resolveExtGState: (name) =>
      name === "GSalpha" ? { fillOpacity: 0.35, strokeOpacity: 0.8 } : null,
  });
  assert.equal(resolved[0].fillOpacity, 0.35);
  assert.equal(resolved[0].strokeOpacity, 0.8);

  const unresolved = walkTextShowOperators(bytes);
  assert.equal(unresolved[0].fillOpacity, null);
  assert.equal(unresolved[0].strokeOpacity, null);
});

test("walkTextShowOperators preserves DeviceCMYK components without inventing an RGB preview", () => {
  const bytes = new TextEncoder().encode(
    "0.1 0.2 0.3 0.4 k BT /F1 12 Tf 1 0 0 1 10 700 Tm (CMYK) Tj ET",
  );
  const [operator] = walkTextShowOperators(bytes);
  assert.deepEqual(operator.fillColor, {
    colorSpace: "DeviceCMYK",
    components: [0.1, 0.2, 0.3, 0.4],
    cssHex: null,
  });
});


test("quote text-show operators re-establish a proven line position after an unmeasurable prior advance", () => {
  const singleQuote = walkTextShowOperators(
    new TextEncoder().encode(
      "BT /F1 12 Tf 14 TL 1 0 0 1 10 700 Tm (A) Tj (B) ' ET",
    ),
    undefined,
    { measureTextAdvance: () => null },
  );
  assert.equal(singleQuote.length, 2);
  assert.equal(singleQuote[0].positionReliability, "proven");
  assert.equal(singleQuote[1].positionReliability, "proven");
  assert.equal(singleQuote[1].textRenderingMatrix[5], 686);

  const doubleQuote = walkTextShowOperators(
    new TextEncoder().encode(
      'BT /F1 12 Tf 14 TL 1 0 0 1 10 700 Tm (A) Tj 1 0 (B) " ET',
    ),
    undefined,
    { measureTextAdvance: () => null },
  );
  assert.equal(doubleQuote.length, 2);
  assert.equal(doubleQuote[1].positionReliability, "proven");
  assert.equal(doubleQuote[1].textRenderingMatrix[5], 686);
});
