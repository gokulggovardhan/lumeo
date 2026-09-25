import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  StandardFonts,
} from "pdf-lib";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import { sha256Hex } from "../lib/pdf/edit/sha256.ts";

function firstFontResource(page: ReturnType<PDFDocument["addPage"]>) {
  const resources = page.node.Resources();
  assert.ok(resources, "saved PDF page should contain a Resources dictionary");
  const fonts = resources.lookup(PDFName.of("Font"), PDFDict);
  const resourceName = fonts.keys()[0]?.asString().replace(/^\//, "");
  assert.ok(resourceName);
  return { resources, resourceName };
}

test("PdfFontRegistry caches a deterministic profile for a standard PDF font", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.HelveticaBoldOblique);
  page.drawText("Premium edit", { x: 72, y: 700, size: 14, font });

  const saved = await doc.save();
  const loaded = await PDFDocument.load(saved);
  const { resources, resourceName } = firstFontResource(loaded.getPage(0));
  const registry = new PdfFontRegistry(loaded);
  const first = registry.resolve(resources, resourceName);
  const second = registry.resolve(resources, resourceName);

  assert.ok(first);
  assert.equal(first, second, "profile should be cached by the real font dictionary");
  assert.equal(first.baseFont, "Helvetica-BoldOblique");
  assert.equal(first.kind, "Type1");
  assert.equal(first.weight, 700);
  assert.equal(first.italic, true);
  assert.equal(first.serif, false);
  assert.equal(first.monospace, false);
  assert.equal(first.browserPreviewPossible, false);
  assert.match(first.cssFallbackFamily, /Arial|Helvetica/);
});

test("PdfFontRegistry exposes browser-loadable embedded TrueType bytes without treating preview as export authority", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fakeTtf = Uint8Array.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptor = context.obj({
    Type: "FontDescriptor",
    FontName: "ABCDEF+DemoSans-Regular",
    Flags: 32,
    ItalicAngle: 0,
    FontWeight: 400,
    FontFile2: fontFileRef,
  });
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+DemoSans-Regular",
    FirstChar: 65,
    LastChar: 65,
    Widths: [600],
    Encoding: "WinAnsiEncoding",
    FontDescriptor: descriptor,
  });
  const resources = context.obj({
    Font: context.obj({ FDemo: fontDict }),
  });

  const registry = new PdfFontRegistry(doc);
  const profile = registry.resolve(resources, "FDemo");
  const program = registry.embeddedProgram(resources, "FDemo");

  assert.ok(profile);
  assert.equal(profile.isEmbedded, true);
  assert.equal(profile.isSubset, true);
  assert.equal(profile.browserPreviewPossible, true);
  assert.ok(program);
  assert.equal(program.format, "truetype");
  assert.equal(program.browserLoadable, true);
  assert.deepEqual([...program.bytes], [...fakeTtf]);

  // Node has no document FontFaceSet. Preview loading must degrade to null,
  // never make the font or edit itself fail.
  assert.equal(await registry.ensureBrowserFont(resources, "FDemo"), null);
});


test("sha256Hex matches the FIPS SHA-256 test vector", () => {
  const bytes = new TextEncoder().encode("abc");
  assert.equal(
    sha256Hex(bytes),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("PdfFontRegistry retains exact Type0/CID resource provenance and vertical writing metadata", async () => {
  const doc = await PDFDocument.create();
  const context = doc.context;
  const fakeTtf = Uint8Array.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);

  const fontFileRef = context.register(context.flateStream(fakeTtf));
  const descriptorRef = context.register(
    context.obj({
      Type: "FontDescriptor",
      FontName: "ABCDEF+DemoCID",
      Flags: 4,
      ItalicAngle: 0,
      Ascent: 800,
      Descent: -200,
      CapHeight: 700,
      FontBBox: [0, -200, 1000, 900],
      StemV: 80,
      FontFile2: fontFileRef,
    }),
  );
  const descendantRef = context.register(
    context.obj({
      Type: "Font",
      Subtype: "CIDFontType2",
      BaseFont: "ABCDEF+DemoCID",
      CIDSystemInfo: {
        Registry: "Adobe",
        Ordering: "Identity",
        Supplement: 0,
      },
      FontDescriptor: descriptorRef,
      DW: 1000,
      W: [3, [600]],
      CIDToGIDMap: "Identity",
    }),
  );

  const cmapText = [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    "1 beginbfchar",
    "<0003> <0048>",
    "endbfchar",
    "endcmap",
    "end",
    "end",
  ].join("\n");
  const toUnicodeRef = context.register(context.stream(cmapText));
  const type0Ref = context.register(
    context.obj({
      Type: "Font",
      Subtype: "Type0",
      BaseFont: "ABCDEF+DemoCID",
      Encoding: "Identity-V",
      DescendantFonts: [descendantRef],
      ToUnicode: toUnicodeRef,
    }),
  );
  const resources = context.obj({
    Font: context.obj({ FCID: type0Ref }),
  });

  const registry = new PdfFontRegistry(doc);
  const profile = registry.resolve(resources, "FCID");
  const program = registry.embeddedProgram(resources, "FCID");

  assert.ok(profile);
  assert.equal(profile.kind, "Type0");
  assert.equal(profile.encodingSource, "ToUnicode");
  assert.equal(profile.metricsSource, "W");
  assert.equal(profile.resourceIdentity.fontObjectRef, type0Ref.toString());
  assert.equal(profile.resourceIdentity.descendantObjectRef, descendantRef.toString());
  assert.equal(profile.resourceIdentity.descriptorObjectRef, descriptorRef.toString());
  assert.equal(profile.resourceIdentity.fontProgramObjectRef, fontFileRef.toString());
  assert.equal(profile.resourceIdentity.toUnicodeObjectRef, toUnicodeRef.toString());
  assert.equal(profile.resourceIdentity.type0Encoding, "Identity-V");
  assert.equal(profile.resourceIdentity.writingMode, "vertical");
  assert.equal(profile.resourceIdentity.descriptorFontName, "ABCDEF+DemoCID");
  assert.equal(profile.resourceIdentity.descendantSubtype, "CIDFontType2");
  assert.equal(profile.resourceIdentity.descendantBaseFont, "ABCDEF+DemoCID");
  assert.deepEqual(profile.resourceIdentity.cidSystemInfo, {
    registry: "Adobe",
    ordering: "Identity",
    supplement: 0,
  });
  assert.deepEqual(profile.resourceIdentity.cidToGidMap, {
    kind: "name",
    name: "Identity",
    objectRef: null,
  });

  assert.ok(program);
  assert.equal(program.objectRef, fontFileRef.toString());
  assert.equal(program.sha256, sha256Hex(fakeTtf));
  assert.equal(profile.embeddedProgramSha256, program.sha256);
  assert.equal(profile.embeddedProgramByteLength, fakeTtf.byteLength);
});
