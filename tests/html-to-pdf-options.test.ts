import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHtml2PdfOptions,
  getPageContentWidthPx,
  getPageSliceHeightPx,
  MARGIN_MM,
  validateHtmlSource,
} from "../lib/pdf/htmlToPdfOptions.ts";

test("margin presets are in millimeters, wide > normal > none", () => {
  assert.equal(MARGIN_MM.none, 0);
  assert.ok(MARGIN_MM.normal > MARGIN_MM.none);
  assert.ok(MARGIN_MM.wide > MARGIN_MM.normal);
});

test("validateHtmlSource rejects blank input only", () => {
  assert.match(validateHtmlSource("") ?? "", /Add some HTML/);
  assert.match(validateHtmlSource("   ") ?? "", /Add some HTML/);
  assert.equal(validateHtmlSource("<p>hi</p>"), null);
});

test("buildHtml2PdfOptions maps page size, orientation, and margin correctly", () => {
  const options = buildHtml2PdfOptions({
    fileName: "lumeo-html.pdf",
    pageSize: "letter",
    orientation: "landscape",
    margin: "wide",
    contentWidthPx: 1056,
    contentHeightPx: 2000,
  });
  assert.equal(options.filename, "lumeo-html.pdf");
  assert.equal(options.margin, MARGIN_MM.wide);
  assert.equal(options.jsPDF.format, "letter");
  assert.equal(options.jsPDF.orientation, "landscape");
  assert.equal(options.jsPDF.unit, "mm");
  assert.equal(options.image.type, "jpeg");
});

test("buildHtml2PdfOptions keeps clone fallback width-only", () => {
  const options = buildHtml2PdfOptions({
    fileName: "lumeo-html.pdf",
    pageSize: "a4",
    orientation: "portrait",
    margin: "normal",
    contentWidthPx: 794,
    contentHeightPx: 1200,
  });
  assert.equal(options.html2canvas.width, 794);
  assert.equal(options.html2canvas.windowWidth, 794);
  assert.equal("height" in options.html2canvas, false);
  assert.equal("windowHeight" in options.html2canvas, false);
});

test("buildHtml2PdfOptions retains CSS-aware page-break fallback modes", () => {
  const options = buildHtml2PdfOptions({
    fileName: "lumeo-html.pdf",
    pageSize: "a4",
    orientation: "portrait",
    margin: "normal",
    contentWidthPx: 794,
    contentHeightPx: 1200,
  });
  assert.deepEqual(options.pagebreak?.mode, ["css", "legacy"]);
});

test("getPageContentWidthPx returns the real page width in CSS px at 96dpi, orientation-aware", () => {
  assert.equal(getPageContentWidthPx("a4", "portrait"), 794);
  assert.equal(getPageContentWidthPx("a4", "landscape"), 1123);
  assert.equal(getPageContentWidthPx("letter", "portrait"), 816);
  assert.equal(getPageContentWidthPx("legal", "portrait"), 816);
  assert.equal(getPageContentWidthPx("legal", "landscape"), 1344);
});

test("getPageSliceHeightPx matches html2pdf printable-page slicing with margins", () => {
  assert.equal(getPageSliceHeightPx("a4", "portrait", "normal", 794), 1165);
  assert.equal(getPageSliceHeightPx("a4", "portrait", "none", 794), 1122);
  assert.equal(getPageSliceHeightPx("a4", "landscape", "normal", 1123), 737);
  assert.ok(
    getPageSliceHeightPx("a4", "portrait", "wide", 794) >
      getPageSliceHeightPx("a4", "portrait", "normal", 794),
  );
});
