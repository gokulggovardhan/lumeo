import assert from "node:assert/strict";
import test from "node:test";
import {
  PDFDict,
  PDFDocument,
  PDFName,
  StandardFonts,
} from "pdf-lib";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";

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
