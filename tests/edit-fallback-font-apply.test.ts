import assert from "node:assert/strict";
import test from "node:test";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { walkTextShowOperators } from "../lib/pdf/edit/contentStream.ts";
import { readFallbackStyleHints } from "../lib/pdf/edit/fallbackFont.ts";
import { resolveFont } from "../lib/pdf/edit/fontEncoding.ts";
import { resolveFontMetrics } from "../lib/pdf/edit/fontMetrics.ts";
import { buildEditPlan } from "../lib/pdf/edit/editPlan.ts";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";

// --- Fixtures ----------------------------------------------------------
//
// Every PDF in this project's existing test suite is produced by pdf-lib
// with standard, non-embedded fonts -- which is exactly why the
// substitute-font code path had never been exercised: those fonts are
// never classified "requires-fallback". These two fixtures are hand-built
// to reproduce the two real-world shapes that ARE:
//
// 1. A Type0/Identity-H font whose /ToUnicode CMap covers only the
//    characters the document already uses -- the shape every modern Word,
//    InDesign, or LaTeX export produces. Any other character has no
//    verified code, so the run's own font can't be trusted with it. This
//    fixture also exercises the trickiest part of the rewrite: the
//    original codes are TWO bytes and the substitute's are ONE.
// 2. A simple TrueType font with a subset BaseFont prefix and an embedded
//    /FontFile2 -- where the nominal WinAnsi encoding table claims a code
//    exists but the subsetted glyph program may genuinely not contain it,
//    which fontEncoding.ts's classifyReplacementChar rejects on principle.

function toUnicodeCMapFor(entries: Array<[number, string]>): string {
  const lines = entries
    .map(([code, char]) => {
      const src = code.toString(16).padStart(4, "0").toUpperCase();
      const dst = char.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase();
      return `<${src}> <${dst}>`;
    })
    .join("\n");
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "1 begincodespacerange",
    "<0000> <FFFF>",
    "endcodespacerange",
    `${entries.length} beginbfchar`,
    lines,
    "endbfchar",
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

/** A page showing "Hello" in a Type0 subset font, plus a control line in a plain standard font. */
async function makeType0SubsetPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;

  const helvetica = await doc.embedFont("Helvetica");

  const cmapBytes = new TextEncoder().encode(
    toUnicodeCMapFor([
      [1, "H"],
      [2, "e"],
      [3, "l"],
      [4, "o"],
    ]),
  );
  const toUnicodeRef = context.register(context.flateStream(cmapBytes));

  const descriptor = context.obj({
    Type: "FontDescriptor",
    FontName: "ABCDEF+TimesNewRomanPS-BoldMT",
    Flags: 32,
    ItalicAngle: 0,
    Ascent: 900,
    Descent: -200,
    CapHeight: 700,
    StemV: 80,
    FontBBox: context.obj([-100, -200, 1000, 900]),
  });
  const descendant = context.obj({
    Type: "Font",
    Subtype: "CIDFontType2",
    BaseFont: "ABCDEF+TimesNewRomanPS-BoldMT",
    CIDSystemInfo: context.obj({ Registry: "Adobe", Ordering: "Identity", Supplement: 0 }),
    DW: 1000,
    W: context.obj([1, context.obj([600, 600, 600, 600])]),
    FontDescriptor: context.register(descriptor),
    CIDToGIDMap: "Identity",
  });
  const type0 = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "ABCDEF+TimesNewRomanPS-BoldMT",
    Encoding: "Identity-H",
    DescendantFonts: context.obj([context.register(descendant)]),
    ToUnicode: toUnicodeRef,
  });

  // lookupMaybe, not lookup: a freshly created page has no /Font entry yet
  // and lookup throws on a missing key rather than returning undefined.
  const fonts = page.node.Resources()!.lookupMaybe(PDFName.of("Font"), PDFDict) ?? context.obj({});
  page.node.Resources()!.set(PDFName.of("Font"), fonts);
  fonts.set(PDFName.of("FSub"), context.register(type0));
  fonts.set(PDFName.of("FStd"), helvetica.ref);

  const content = [
    "BT",
    "/FStd 12 Tf",
    "1 0 0 1 50 720 Tm",
    "(Control line) Tj",
    "ET",
    "BT",
    "/FSub 14 Tf",
    "1 0 0 1 50 690 Tm",
    "<00010002000300030004> Tj",
    "ET",
  ].join("\n");
  page.node.set(PDFName.of("Contents"), context.register(context.flateStream(new TextEncoder().encode(content))));

  return doc.save();
}

/** A page showing "Hello" in an embedded-subset simple TrueType font. */
async function makeSimpleSubsetPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;

  // Never parsed by anything in this pipeline: fontEncoding.ts's isEmbedded
  // check only asks whether /FontFile2 is PRESENT, which is precisely the
  // point -- the engine refuses to guess at glyph coverage it cannot see.
  const fontFileRef = context.register(context.flateStream(new Uint8Array([0x00, 0x01, 0x00, 0x00])));
  const descriptor = context.obj({
    Type: "FontDescriptor",
    FontName: "ABCDEF+Arial-BoldMT",
    Flags: 32,
    ItalicAngle: 0,
    StemV: 80,
    FontBBox: context.obj([-100, -200, 1000, 900]),
    FontFile2: fontFileRef,
  });
  const fontDict = context.obj({
    Type: "Font",
    Subtype: "TrueType",
    BaseFont: "ABCDEF+Arial-BoldMT",
    Encoding: "WinAnsiEncoding",
    FirstChar: 32,
    LastChar: 126,
    Widths: context.obj(Array.from({ length: 95 }, () => 600)),
    FontDescriptor: context.register(descriptor),
  });

  const fonts = context.obj({});
  fonts.set(PDFName.of("FSub"), context.register(fontDict));
  page.node.Resources()!.set(PDFName.of("Font"), fonts);

  const content = ["BT", "/FSub 14 Tf", "1 0 0 1 50 690 Tm", "<48656C6C6F> Tj", "ET"].join("\n");
  page.node.set(PDFName.of("Contents"), context.register(context.flateStream(new TextEncoder().encode(content))));

  return doc.save();
}

// --- Shared plumbing ---------------------------------------------------

async function decodedPageContent(pdfBytes: Uint8Array): Promise<string> {
  const loaded = await PDFDocument.load(pdfBytes);
  const page = loaded.getPages()[0];
  const contents = page.node.Contents();
  const streams: PDFStream[] =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_unused, i) => loaded.context.lookup(contents.get(i), PDFStream))
      : [contents as PDFStream];
  return streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream)) throw new Error("Expected a raw content stream.");
      return new TextDecoder().decode(decodePDFRawStream(stream).decode());
    })
    .join("\n");
}

async function extractedStrings(pdfBytes: Uint8Array): Promise<string[]> {
  const doc = await pdfjsLib.getDocument({ data: pdfBytes.slice() }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  // Empty items are dropped: pdfjs emits a zero-length item at a BT/ET
  // boundary, so a page with two text objects reports a blank between
  // them -- present in these fixtures BEFORE any edit, and therefore
  // nothing an assertion about the edit should be sensitive to.
  return content.items.map((item) => ("str" in item ? item.str : "")).filter((str) => str !== "");
}

type PreparedEdit = Awaited<ReturnType<typeof prepareEdit>>;

async function prepareEdit(pdfBytes: Uint8Array, resourceName: string) {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPages()[0];
  const contents = page.node.Contents();
  const stream = contents instanceof PDFArray ? doc.context.lookup(contents.get(0), PDFStream) : (contents as PDFStream);
  if (!(stream instanceof PDFRawStream)) throw new Error("Expected a raw content stream.");
  const bytes = decodePDFRawStream(stream).decode();

  const operators = walkTextShowOperators(bytes);
  const operatorIndex = operators.findIndex((op) => op.fontResourceName === resourceName);
  if (operatorIndex < 0) throw new Error(`No text-show operator found using /${resourceName}.`);

  const fontDict = page.node
    .Resources()!
    .lookup(PDFName.of("Font"), PDFDict)
    .lookup(PDFName.of(resourceName), PDFDict);
  const resolvedFont = resolveFont(fontDict, doc.context);
  const fontMetrics = resolveFontMetrics(fontDict, doc.context, resolvedFont);
  const styleHints = readFallbackStyleHints(fontDict, doc.context);

  return { doc, operator: operators[operatorIndex], operatorIndex, resolvedFont, fontMetrics, styleHints };
}

function planFor(prepared: PreparedEdit, replacementText: string, withFallback: boolean) {
  return buildEditPlan({
    pageIndex: 0,
    contentStreamIndex: 0,
    operatorIndex: prepared.operatorIndex,
    operator: prepared.operator,
    replacementText,
    resolvedFont: prepared.resolvedFont,
    fontMetrics: prepared.fontMetrics,
    fallbackStyleHints: withFallback ? prepared.styleHints : null,
  });
}

// --- The fixtures really do reject, before any fallback is offered -----

test("a Type0 subset font rejects a character its own ToUnicode CMap never covers", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  assert.equal(prepared.resolvedFont.kind, "Type0");
  assert.equal(prepared.resolvedFont.bytesPerCode, 2);

  // "Hello" -> "Hell" only reuses codes the CMap already proves exist.
  assert.equal(planFor(prepared, "Hell", false).editable, true);

  const rejected = planFor(prepared, "Héllo", false);
  assert.equal(rejected.editable, false);
  assert.match(rejected.reason ?? "", /not a verified glyph in this font/);
  assert.equal(rejected.fallbackFont, null);
});

test("an embedded-subset simple TrueType font rejects even a character its encoding table claims to have", async () => {
  const prepared = await prepareEdit(await makeSimpleSubsetPdf(), "FSub");
  assert.equal(prepared.resolvedFont.kind, "TrueType");
  assert.equal(prepared.resolvedFont.isEmbedded, true);
  assert.equal(prepared.resolvedFont.isSubset, true);

  // WinAnsiEncoding nominally has a code for "W", but a subsetted glyph
  // program may simply not contain that outline -- unknowable without
  // parsing the font binary, so it's rejected rather than guessed at.
  const rejected = planFor(prepared, "World", false);
  assert.equal(rejected.editable, false);
  assert.match(rejected.reason ?? "", /not a verified glyph in this font/);
});

// --- Opting in produces a substitute-font plan -------------------------

test("opting in turns the Type0 rejection into a plan that uses a style-matched substitute", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  const plan = planFor(prepared, "Héllo", true);

  assert.equal(plan.editable, true);
  assert.equal(plan.reason, null);
  // BaseFont says Times + Bold, so the substitute must too -- picking the
  // wrong class is a visible layout change, not a cosmetic one.
  assert.equal(plan.fallbackFont?.family, "Times-Bold");
  assert.equal(plan.fallbackFont?.originalFontResourceName, "FSub");
  // The decisive detail: the original run's codes are 2 bytes each, the
  // substitute's are 1, because a standard /WinAnsiEncoding font is a
  // simple font no matter what the run's own font was.
  assert.deepEqual(plan.originalGlyphCodes, [1, 2, 3, 3, 4]);
  assert.equal(plan.fallbackFont?.bytesPerCode, 1);
  assert.deepEqual(plan.replacementGlyphCodes, [0x48, 0xe9, 0x6c, 0x6c, 0x6f]);
});

test("the substitute plan measures each side against its own font's metrics", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  const plan = planFor(prepared, "Héllo", true);

  // The fixture's CIDFont gives every glyph a flat 600 units, so five
  // glyphs at 14pt is exactly 5 * 0.600 * 14 = 42pt.
  assert.equal(plan.originalWidthPt.toFixed(4), (42).toFixed(4));
  // Times-Bold is proportional, so the replacement cannot coincidentally
  // match -- and the TJ adjustment must be the exact inverse of the gap.
  assert.notEqual(plan.replacementWidthPt.toFixed(4), plan.originalWidthPt.toFixed(4));
  const deltaPt = plan.replacementWidthPt - plan.originalWidthPt;
  assert.ok(Math.abs(plan.tjSpacingDelta - (deltaPt / 14) * 1000) < 1e-9);
});

test("a character no standard font can show is still rejected, with a reason that says so", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  const plan = planFor(prepared, "H中llo", true);
  assert.equal(plan.editable, false);
  assert.equal(plan.fallbackFont, null);
  assert.match(plan.reason ?? "", /none of the standard substitute fonts can show it/);
});

test("a run whose own font resource can't be named is rejected rather than left in the substitute font", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  // Without a name to restore, the Tf switch would leak the substitute
  // into every later run in the same text object.
  const nameless = { ...prepared, operator: { ...prepared.operator, fontResourceName: null } };
  const plan = planFor(nameless as PreparedEdit, "Héllo", true);
  assert.equal(plan.editable, false);
  assert.match(plan.reason ?? "", /couldn't be switched back off afterwards/);
});

// --- Applying it to a real document ------------------------------------

test("applying a substitute-font edit rewrites one operator into a Tf-wrapped run and nothing else", async () => {
  const original = await makeType0SubsetPdf();
  const prepared = await prepareEdit(original, "FSub");
  const plan = planFor(prepared, "Héllo", true);

  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  const edited = await prepared.doc.save();
  const content = await decodedPageContent(edited);

  // Switch on, show, switch straight back -- all inside the one replaced
  // byte range, so the following text object can't inherit the substitute.
  assert.match(content, /\/LumeoFallback0 14 Tf \[<48e96c6c6f>[^\]]*\] TJ \/FSub 14 Tf/);
  // Everything outside that range is preserved byte-for-byte, including
  // the control line and the original Tf that selected the subset font.
  assert.match(content, /\(Control line\) Tj/);
  assert.match(content, /BT\n\/FSub 14 Tf\n1 0 0 1 50 690 Tm/);
  assert.equal(content.includes("<00010002000300030004>"), false);
});

test("the rewritten page really renders the new text, read back by pdfjs", async () => {
  const original = await makeType0SubsetPdf();
  assert.deepEqual(await extractedStrings(original), ["Control line", "Hello"]);

  const prepared = await prepareEdit(original, "FSub");
  const plan = planFor(prepared, "Héllo", true);
  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  const edited = await prepared.doc.save();

  // The real proof that the whole chain is coherent: an independent PDF
  // engine, given only the output bytes, resolves /LumeoFallback0 to a
  // standard font, decodes the single-byte WinAnsi string through it, and
  // reads back exactly the text that was asked for -- accented character
  // included, which the run's own font could not have shown.
  assert.deepEqual(await extractedStrings(edited), ["Control line", "Héllo"]);
});

test("the substitute font is written into the page's /Resources /Font, leaving the original entry untouched", async () => {
  const prepared = await prepareEdit(await makeType0SubsetPdf(), "FSub");
  const plan = planFor(prepared, "Héllo", true);
  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  const edited = await prepared.doc.save();

  const reloaded = await PDFDocument.load(edited);
  const fonts = reloaded.getPages()[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);

  const substitute = reloaded.context.lookup(fonts.get(PDFName.of("LumeoFallback0")), PDFDict);
  assert.equal(substitute.get(PDFName.of("BaseFont"))!.toString(), "/Times-Bold");
  assert.equal(substitute.get(PDFName.of("Encoding"))!.toString(), "/WinAnsiEncoding");

  const untouched = reloaded.context.lookup(fonts.get(PDFName.of("FSub")), PDFDict);
  assert.equal(untouched.get(PDFName.of("Subtype"))!.toString(), "/Type0");
  assert.equal(untouched.get(PDFName.of("BaseFont"))!.toString(), "/ABCDEF+TimesNewRomanPS-BoldMT");
  assert.ok(fonts.has(PDFName.of("FStd")), "the unrelated standard font resource must survive");
});

test("an embedded-subset simple font takes the same path, one byte per code throughout", async () => {
  const prepared = await prepareEdit(await makeSimpleSubsetPdf(), "FSub");
  const plan = planFor(prepared, "World", true);
  assert.equal(plan.editable, true);
  assert.equal(plan.fallbackFont?.family, "Helvetica-Bold");

  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  const edited = await prepared.doc.save();

  const content = await decodedPageContent(edited);
  assert.match(content, /\/LumeoFallback0 14 Tf \[<576f726c64>[^\]]*\] TJ \/FSub 14 Tf/);
  assert.deepEqual(await extractedStrings(edited), ["World"]);
});

test("two substitute edits on one page share a single embedded font object", async () => {
  const original = await makeType0SubsetPdf();
  const prepared = await prepareEdit(original, "FSub");
  const plan = planFor(prepared, "Héllo", true);

  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  // A second edit against the same in-memory document, before any save --
  // the case where pdf-lib has reserved the font's ref but not yet written
  // its dictionary, so a naive reuse check would embed a duplicate.
  await applyEditPlanToDocument(prepared.doc, { ...plan, replacementText: "Hé" }, prepared.resolvedFont.bytesPerCode);
  const edited = await prepared.doc.save();

  const reloaded = await PDFDocument.load(edited);
  const fonts = reloaded.getPages()[0].node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  const names = fonts.keys().map((key) => key.asString());
  assert.deepEqual(names.filter((name) => name.startsWith("/LumeoFallback")), ["/LumeoFallback0"]);
});

test("a font resource whose name needs #-escaping is restored as the same name, not a different one", async () => {
  // contentStream.ts's tokenizer decodes #xx when it reads a name, so
  // "/F#231" arrives as the three characters F#1. Writing that back
  // verbatim would emit "/F#1", which re-reads as "F\x01" -- a silently
  // different font for everything after the edit.
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const context = doc.context;
  const helvetica = await doc.embedFont("Helvetica");

  const cmapBytes = new TextEncoder().encode(toUnicodeCMapFor([[1, "H"]]));
  const type0 = context.obj({
    Type: "Font",
    Subtype: "Type0",
    BaseFont: "ABCDEF+ArialMT",
    Encoding: "Identity-H",
    DescendantFonts: context.obj([
      context.register(
        context.obj({
          Type: "Font",
          Subtype: "CIDFontType2",
          BaseFont: "ABCDEF+ArialMT",
          CIDSystemInfo: context.obj({ Registry: "Adobe", Ordering: "Identity", Supplement: 0 }),
          DW: 600,
        }),
      ),
    ]),
    ToUnicode: context.register(context.flateStream(cmapBytes)),
  });

  const fonts = context.obj({});
  fonts.set(PDFName.of("F#1"), context.register(type0));
  fonts.set(PDFName.of("FStd"), helvetica.ref);
  page.node.Resources()!.set(PDFName.of("Font"), fonts);
  page.node.set(
    PDFName.of("Contents"),
    context.register(
      context.flateStream(new TextEncoder().encode(["BT", "/F#231 12 Tf", "1 0 0 1 50 700 Tm", "<0001> Tj", "ET"].join("\n"))),
    ),
  );

  const prepared = await prepareEdit(await doc.save(), "F#1");
  const plan = planFor(prepared, "Hé", true);
  assert.equal(plan.fallbackFont?.originalFontResourceName, "F#1");

  await applyEditPlanToDocument(prepared.doc, plan, prepared.resolvedFont.bytesPerCode);
  const content = await decodedPageContent(await prepared.doc.save());
  assert.match(content, /\/F#231 12 Tf$/m, "the restoring Tf must re-escape the name exactly as the stream had it");
});
