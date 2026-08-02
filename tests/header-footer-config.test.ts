import assert from "node:assert/strict";
import test from "node:test";
import {
  alignmentToCorner,
  createDefaultHeaderFooterConfig,
  renderZoneText,
  resolvePlaceholders,
} from "../lib/pdf/headerFooter/config.ts";

test("createDefaultHeaderFooterConfig returns sane defaults", () => {
  const config = createDefaultHeaderFooterConfig();
  assert.equal(config.header.enabled, false);
  assert.equal(config.footer.enabled, true);
  assert.equal(config.footer.template, "{page}");
  assert.equal(config.firstPageDifferent, false);
  assert.equal(config.pageRange.mode, "all");
});

test("alignmentToCorner maps header/footer x left/center/right onto the shared PlacementCorner values", () => {
  assert.equal(alignmentToCorner("header", "left"), "top-left");
  assert.equal(alignmentToCorner("header", "center"), "top-center");
  assert.equal(alignmentToCorner("header", "right"), "top-right");
  assert.equal(alignmentToCorner("footer", "left"), "bottom-left");
  assert.equal(alignmentToCorner("footer", "center"), "bottom-center");
  assert.equal(alignmentToCorner("footer", "right"), "bottom-right");
});

test("resolvePlaceholders replaces {page} and {pages}", () => {
  const context = { pageNumber: 3, totalPages: 10, filename: "report.pdf" };
  assert.equal(resolvePlaceholders("Page {page} of {pages}", context), "Page 3 of 10");
});

test("resolvePlaceholders replaces {filename}", () => {
  const context = { pageNumber: 1, totalPages: 1, filename: "Q3-Report.pdf" };
  assert.equal(resolvePlaceholders("{filename}", context), "Q3-Report.pdf");
});

test("resolvePlaceholders replaces {date} and {time} using the injected date", () => {
  const fixedDate = new Date(2026, 0, 15, 14, 30); // Jan 15 2026, 14:30 local
  const context = { pageNumber: 1, totalPages: 1, filename: "x.pdf", now: fixedDate };
  const dateResult = resolvePlaceholders("{date}", context);
  const timeResult = resolvePlaceholders("{time}", context);
  assert.equal(dateResult, fixedDate.toLocaleDateString());
  assert.equal(timeResult, fixedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
});

test("resolvePlaceholders leaves unrecognized tokens untouched", () => {
  const context = { pageNumber: 1, totalPages: 1, filename: "x.pdf" };
  assert.equal(resolvePlaceholders("{unknown} and {page}", context), "{unknown} and 1");
});

test("resolvePlaceholders handles multiple occurrences of the same placeholder", () => {
  const context = { pageNumber: 2, totalPages: 5, filename: "x.pdf" };
  assert.equal(resolvePlaceholders("{page}/{pages} -- page {page}", context), "2/5 -- page 2");
});

test("renderZoneText returns empty string for a disabled zone", () => {
  const zone = { enabled: false, template: "{page}", prefix: "", suffix: "", alignment: "center" as const };
  assert.equal(renderZoneText(zone, { pageNumber: 1, totalPages: 1, filename: "x.pdf" }), "");
});

test("renderZoneText applies prefix and suffix around the resolved template", () => {
  const zone = { enabled: true, template: "{page}", prefix: "- ", suffix: " -", alignment: "center" as const };
  assert.equal(renderZoneText(zone, { pageNumber: 4, totalPages: 9, filename: "x.pdf" }), "- 4 -");
});

test("renderZoneText with an empty template and no prefix/suffix returns empty string", () => {
  const zone = { enabled: true, template: "", prefix: "", suffix: "", alignment: "center" as const };
  assert.equal(renderZoneText(zone, { pageNumber: 1, totalPages: 1, filename: "x.pdf" }), "");
});
