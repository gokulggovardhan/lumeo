import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { applyEditPlanToDocument } from "../lib/pdf/edit/applyEditPlan.ts";
import { buildEditPlan, decodeTextShowOperator } from "../lib/pdf/edit/editPlan.ts";
import {
  appendPdfEditOperations,
  createPdfEditSession,
  nativeTextOperation,
  type PdfEditSessionState,
} from "../lib/pdf/edit/editSession.ts";
import { createTextElement } from "../lib/pdf/edit/elements.ts";
import { exportEditedPdf } from "../lib/pdf/edit/export.ts";
import { collectPageTextOperators } from "../lib/pdf/edit/formXObjects.ts";
import { PdfFontRegistry } from "../lib/pdf/edit/fontRegistry.ts";
import {
  verifyPostExportNativeEdits,
  type PostExportPdfJsOpener,
} from "../lib/pdf/edit/postExportVerification.ts";

async function buildNativeEditedFixture(): Promise<{
  bytes: Uint8Array;
  session: PdfEditSessionState;
}> {
  const originalDoc = await PDFDocument.create();
  const page = originalDoc.addPage([612, 792]);
  const font = await originalDoc.embedFont(StandardFonts.Helvetica);
  page.drawText("Invoice", { x: 72, y: 700, size: 14, font });
  page.drawText("Neighbor", { x: 72, y: 650, size: 12, font });
  const originalBytes = await originalDoc.save();

  const doc = await PDFDocument.load(originalBytes.slice());
  const located = collectPageTextOperators(doc, 0);
  const registry = new PdfFontRegistry(doc);

  const target = located.find((entry) => {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) return false;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) return false;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    return decoded.allDecoded && decoded.text === "Invoice";
  });
  assert.ok(target);
  assert.ok(target.operator.fontResourceName);

  const profile = registry.resolve(
    target.resources,
    target.operator.fontResourceName,
  );
  assert.ok(profile);

  const plan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex:
      target.locator.kind === "page"
        ? target.locator.contentStreamIndex
        : 0,
    formPath:
      target.locator.kind === "xobject"
        ? target.locator.formPath
        : null,
    operatorIndex: target.operatorIndex,
    operator: target.operator,
    replacementText: "Receipt",
    resolvedFont: profile.resolvedFont,
    fontMetrics: profile.metrics,
    embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
  });
  if (!plan.editable) throw new Error(plan.reason);
  assert.equal(plan.editable, true);

  await applyEditPlanToDocument(
    doc,
    plan,
    profile.resolvedFont.bytesPerCode,
    { isolate: target.locator.kind === "xobject" },
  );
  const bytes = await doc.save();

  const operation = nativeTextOperation({
    pageIndex: 0,
    spanIds: ["p0-span-invoice"],
    contentStreamIndex: plan.formPath
      ? null
      : plan.contentStreamIndex,
    formPath: plan.formPath,
    operatorIndices: [plan.operatorIndex],
    fontResourceName: plan.fontResourceName,
    originalText: plan.originalText,
    replacementText: plan.replacementText,
  });
  const session = appendPdfEditOperations(
    createPdfEditSession(originalBytes.byteLength),
    [operation],
  );

  return { bytes, session };
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const openLegacyPdfJs: PostExportPdfJsOpener = async (data) =>
  (await pdfjsLib.getDocument({
    data:
      data instanceof Uint8Array
        ? data.slice()
        : new Uint8Array(data.slice(0)),
    useWorkerFetch: false,
  }).promise) as unknown as Awaited<ReturnType<PostExportPdfJsOpener>>;

test("post-export verification proves a native edit survives an overlay export", async () => {
  const source = await buildNativeEditedFixture();
  const overlay = {
    ...createTextElement("overlay", 0, 55, 15),
    text: "Approved",
    fontSizePt: 11,
  };

  const exported = await exportEditedPdf(
    asArrayBuffer(source.bytes),
    [overlay],
  );
  assert.deepEqual(exported.skippedPages, []);

  const verification = await verifyPostExportNativeEdits({
    sourceBytes: source.bytes,
    exportedBytes: exported.bytes,
    session: source.session,
    verifyPdfJs: false,
  });

  assert.equal(verification.ok, true);
  assert.equal(verification.status, "verified");
  if (!verification.ok || verification.status !== "verified") return;
  assert.equal(verification.checkedTargets, 1);
  assert.equal(verification.checkedOperators, 1);
  assert.equal(verification.pdfJsPagesChecked, 0);
});

test("post-export verification blocks a text-corrupted native target", async () => {
  const source = await buildNativeEditedFixture();
  const corrupted = await PDFDocument.load(source.bytes.slice());
  const located = collectPageTextOperators(corrupted, 0);
  const registry = new PdfFontRegistry(corrupted);

  const target = located.find((entry) => {
    const resourceName = entry.operator.fontResourceName;
    if (!resourceName) return false;
    const profile = registry.resolve(entry.resources, resourceName);
    if (!profile) return false;
    const decoded = decodeTextShowOperator(
      entry.operator,
      profile.resolvedFont,
    );
    return decoded.allDecoded && decoded.text === "Receipt";
  });
  assert.ok(target);
  assert.ok(target.operator.fontResourceName);
  const profile = registry.resolve(
    target.resources,
    target.operator.fontResourceName,
  );
  assert.ok(profile);

  const corruptPlan = buildEditPlan({
    pageIndex: 0,
    contentStreamIndex:
      target.locator.kind === "page"
        ? target.locator.contentStreamIndex
        : 0,
    formPath:
      target.locator.kind === "xobject"
        ? target.locator.formPath
        : null,
    operatorIndex: target.operatorIndex,
    operator: target.operator,
    replacementText: "Damaged",
    resolvedFont: profile.resolvedFont,
    fontMetrics: profile.metrics,
    embeddedGlyphEvidence: profile.embeddedGlyphEvidence,
  });
  if (!corruptPlan.editable) throw new Error(corruptPlan.reason);
  assert.equal(corruptPlan.editable, true);

  await applyEditPlanToDocument(
    corrupted,
    corruptPlan,
    profile.resolvedFont.bytesPerCode,
  );
  const corruptedBytes = await corrupted.save();

  const verification = await verifyPostExportNativeEdits({
    sourceBytes: source.bytes,
    exportedBytes: corruptedBytes,
    session: source.session,
    verifyPdfJs: false,
  });

  assert.equal(verification.ok, false);
  if (verification.ok) return;
  assert.match(
    verification.reason,
    /text|font\/style state|geometry|could not be located/i,
  );
});

test("post-export verification blocks PDF-space geometry drift", async () => {
  const source = await buildNativeEditedFixture();
  const corrupted = await PDFDocument.load(source.bytes.slice());
  corrupted.getPage(0).translateContent(7, 0);
  const corruptedBytes = await corrupted.save();

  const verification = await verifyPostExportNativeEdits({
    sourceBytes: source.bytes,
    exportedBytes: corruptedBytes,
    session: source.session,
    verifyPdfJs: true,
    openPdfJs: openLegacyPdfJs,
  });

  assert.equal(verification.ok, false);
  if (verification.ok) return;
  assert.match(
    verification.reason,
    /position\/transform|geometry|could not be located|native text/i,
  );
});

test("overlay-only sessions skip native post-export verification without parsing bytes", async () => {
  const verification = await verifyPostExportNativeEdits({
    sourceBytes: new Uint8Array([0]),
    exportedBytes: new Uint8Array([1]),
    session: createPdfEditSession(0),
    verifyPdfJs: true,
  });

  assert.deepEqual(verification, {
    ok: true,
    status: "not-needed",
    checkedTargets: 0,
    checkedOperators: 0,
    pdfJsPagesChecked: 0,
    reason: null,
  });
});
