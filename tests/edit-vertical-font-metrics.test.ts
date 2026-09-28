import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDocument,
  PDFName,
  type PDFDict,
} from "pdf-lib";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import {
  metricForVerticalCid,
  resolveVerticalFontMetricsEvidence,
} from "../lib/pdf/edit/verticalFontMetrics.ts";

function utf16Hex(text: string): string {
  return [...text]
    .map((char) => {
      const codePoint = char.codePointAt(0)!;
      if (codePoint <= 0xffff) {
        return codePoint.toString(16).padStart(4, "0");
      }
      const value = codePoint - 0x10000;
      const high = 0xd800 + (value >> 10);
      const low = 0xdc00 + (value & 0x3ff);
      return (
        high.toString(16).padStart(4, "0") +
        low.toString(16).padStart(4, "0")
      );
    })
    .join("")
    .toUpperCase();
}

async function verticalFixture({
  encoding = "Identity-V",
  dw2,
  w2,
}: {
  encoding?: "Identity-H" | "Identity-V";
  dw2?: readonly number[] | "malformed";
  w2?: readonly unknown[] | "malformed";
} = {}) {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fakeTtf = Uint8Array.from([
    0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
  ]);
  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "ABCDEF+VerticalEvidence",
      Flags: 32,
      ItalicAngle: 0,
      Ascent: 800,
      Descent: -200,
      CapHeight: 700,
      FontBBox: [0, -200, 1000, 900],
      StemV: 80,
      FontFile2: fontFileRef,
    }),
  );

  const descendantValues: Record<string, unknown> = {
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "ABCDEF+VerticalEvidence",
    CIDSystemInfo: {
      Registry: "Adobe",
      Ordering: "Identity",
      Supplement: 0,
    },
    FontDescriptor: descriptorRef,
    DW: 1000,
    W: [3, [600, 700, 800], 10, 12, 900],
    CIDToGIDMap: "Identity",
  };
  if (dw2 === "malformed") {
    descendantValues.DW2 = context.obj([880]);
  } else if (dw2) {
    descendantValues.DW2 = [...dw2];
  }
  if (w2 === "malformed") {
    descendantValues.W2 = context.obj([3, [-1200, 300]]);
  } else if (w2) {
    descendantValues.W2 = [...w2];
  }

  const descendantRef = context.register(context.obj(descendantValues));
  const toUnicodeEntries = new Map<number, string>([
    [3, "A"],
    [4, "B"],
    [5, "C"],
    [10, "X"],
    [11, "Y"],
    [12, "Z"],
  ]);
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${toUnicodeEntries.size} beginbfchar`,
    ...[...toUnicodeEntries].map(
      ([cid, text]) =>
        `<${cid.toString(16).padStart(4, "0").toUpperCase()}> <${utf16Hex(text)}>`,
    ),
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");
  const toUnicodeRef = context.register(
    context.stream(new TextEncoder().encode(cmap)),
  );
  const fontRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ABCDEF+VerticalEvidence",
      Encoding: encoding,
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  const resources = context.obj({
    Font: context.obj({ FVertical: fontRef }),
  });

  return {
    doc,
    resources,
    fontRef,
  };
}

test("vertical metrics resolve PDF defaults and derive default v1x from horizontal width", async () => {
  const fixture = await verticalFixture();
  const registry = new PdfFontRegistry(fixture.doc);
  const evidence = registry.inspectVerticalFontMetrics(
    fixture.resources,
    "FVertical",
  );

  assert.equal(evidence.kind, "resolved");
  if (evidence.kind !== "resolved") return;
  assert.equal(evidence.advisoryOnly, true);
  assert.equal(evidence.source, "DW2");
  assert.equal(evidence.defaultPositionY, 880);
  assert.equal(evidence.defaultDisplacementY, -1000);
  assert.equal(evidence.explicitMetrics.size, 0);

  const profile = registry.resolve(fixture.resources, "FVertical");
  assert.ok(profile);
  const metric = metricForVerticalCid({
    cid: 3,
    vertical: evidence,
    horizontal: profile!.metrics,
  });
  assert.deepEqual(metric, {
    displacementY: -1000,
    positionX: 300,
    positionY: 880,
    source: "DW2",
  });
});

test("vertical metrics parse custom DW2 and consecutive W2 triplets exactly", async () => {
  const fixture = await verticalFixture({
    dw2: [910, -1110],
    w2: [3, [-1200, 320, 930, -1250, 360, 940]],
  });
  const registry = new PdfFontRegistry(fixture.doc);
  const evidence = registry.inspectVerticalFontMetrics(
    fixture.resources,
    "FVertical",
  );

  assert.equal(evidence.kind, "resolved");
  if (evidence.kind !== "resolved") return;
  assert.equal(evidence.source, "W2");
  assert.equal(evidence.defaultPositionY, 910);
  assert.equal(evidence.defaultDisplacementY, -1110);
  assert.deepEqual(evidence.explicitMetrics.get(3), {
    displacementY: -1200,
    positionX: 320,
    positionY: 930,
    source: "W2",
  });
  assert.deepEqual(evidence.explicitMetrics.get(4), {
    displacementY: -1250,
    positionX: 360,
    positionY: 940,
    source: "W2",
  });
});

test("vertical metrics parse W2 CID ranges and leave other CIDs on DW2 defaults", async () => {
  const fixture = await verticalFixture({
    dw2: [900, -1050],
    w2: [10, 12, -1300, 410, 950],
  });
  const registry = new PdfFontRegistry(fixture.doc);
  const evidence = registry.inspectVerticalFontMetrics(
    fixture.resources,
    "FVertical",
  );
  assert.equal(evidence.kind, "resolved");
  if (evidence.kind !== "resolved") return;

  for (const cid of [10, 11, 12]) {
    assert.deepEqual(evidence.explicitMetrics.get(cid), {
      displacementY: -1300,
      positionX: 410,
      positionY: 950,
      source: "W2",
    });
  }

  const profile = registry.resolve(fixture.resources, "FVertical");
  assert.ok(profile);
  const fallbackMetric = metricForVerticalCid({
    cid: 5,
    vertical: evidence,
    horizontal: profile!.metrics,
  });
  assert.deepEqual(fallbackMetric, {
    displacementY: -1050,
    positionX: 400,
    positionY: 900,
    source: "DW2",
  });
});

test("vertical metrics fail closed on malformed DW2", async () => {
  const fixture = await verticalFixture({ dw2: "malformed" });
  const evidence = new PdfFontRegistry(
    fixture.doc,
  ).inspectVerticalFontMetrics(fixture.resources, "FVertical");
  assert.equal(evidence.kind, "blocked");
  if (evidence.kind === "blocked") {
    assert.match(evidence.reason, /DW2.*exactly/i);
  }
});

test("vertical metrics fail closed on malformed W2 triplets", async () => {
  const fixture = await verticalFixture({ w2: "malformed" });
  const evidence = new PdfFontRegistry(
    fixture.doc,
  ).inspectVerticalFontMetrics(fixture.resources, "FVertical");
  assert.equal(evidence.kind, "blocked");
  if (evidence.kind === "blocked") {
    assert.match(evidence.reason, /W2.*triplets/i);
  }
});

test("vertical metrics fail closed on overlapping W2 definitions", async () => {
  const fixture = await verticalFixture({
    w2: [
      3,
      [-1200, 300, 900, -1200, 350, 900],
      4,
      5,
      -1300,
      400,
      920,
    ],
  });
  const evidence = new PdfFontRegistry(
    fixture.doc,
  ).inspectVerticalFontMetrics(fixture.resources, "FVertical");
  assert.equal(evidence.kind, "blocked");
  if (evidence.kind === "blocked") {
    assert.match(evidence.reason, /more than once|ambiguous/i);
  }
});

test("Identity-H resources do not gain vertical metric authority", async () => {
  const fixture = await verticalFixture({
    encoding: "Identity-H",
    dw2: [910, -1110],
    w2: [3, [-1200, 320, 930]],
  });
  const evidence = new PdfFontRegistry(
    fixture.doc,
  ).inspectVerticalFontMetrics(fixture.resources, "FVertical");
  assert.equal(evidence.kind, "blocked");
  if (evidence.kind === "blocked") {
    assert.match(evidence.reason, /not proven.*vertical|vertical writing mode/i);
  }
});

test("direct resolver remains advisory and rejects non-Type0 fonts", async () => {
  const doc = await PDFDocument.create();
  const fontDict = doc.context.obj({
    Type: "Font",
    Subtype: "Type1",
    BaseFont: "Helvetica",
  }) as PDFDict;
  const evidence = resolveVerticalFontMetricsEvidence({
    fontDict,
    context: doc.context,
    fontKind: "Type1",
    writingMode: "vertical",
  });
  assert.equal(evidence.kind, "blocked");
  assert.equal(evidence.advisoryOnly, true);
  if (evidence.kind === "blocked") {
    assert.match(evidence.reason, /Type0/i);
  }
});
