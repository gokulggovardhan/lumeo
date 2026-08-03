import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultPageNumbersConfig,
  formatNumeral,
  formatPageLabel,
  toAlpha,
  toRoman,
} from "../lib/pdf/pageNumbers/config.ts";

test("createDefaultPageNumbersConfig returns sane defaults", () => {
  const config = createDefaultPageNumbersConfig();
  assert.equal(config.numberFormat, "page-x");
  assert.equal(config.numeralStyle, "arabic");
  assert.equal(config.startNumber, 1);
  assert.equal(config.skipFirstPage, false);
  assert.equal(config.pageRange.mode, "all");
  assert.deepEqual(config.placement, { mode: "corner", corner: "bottom-center" });
  assert.ok(config.opacity > 0 && config.opacity <= 1);
});

test("toRoman converts standard values, including subtractive-notation cases", () => {
  assert.equal(toRoman(1), "I");
  assert.equal(toRoman(4), "IV");
  assert.equal(toRoman(9), "IX");
  assert.equal(toRoman(14), "XIV");
  assert.equal(toRoman(40), "XL");
  assert.equal(toRoman(90), "XC");
  assert.equal(toRoman(400), "CD");
  assert.equal(toRoman(944), "CMXLIV");
  assert.equal(toRoman(1994), "MCMXCIV");
  assert.equal(toRoman(3999), "MMMCMXCIX");
});

test("toRoman falls back to plain digits outside its valid range", () => {
  assert.equal(toRoman(0), "0");
  assert.equal(toRoman(-5), "-5");
  assert.equal(toRoman(4000), "4000");
  assert.equal(toRoman(1.5), "1.5");
});

test("toAlpha converts spreadsheet-column-style, including the a-z -> aa rollover", () => {
  assert.equal(toAlpha(1), "a");
  assert.equal(toAlpha(2), "b");
  assert.equal(toAlpha(26), "z");
  assert.equal(toAlpha(27), "aa");
  assert.equal(toAlpha(28), "ab");
  assert.equal(toAlpha(52), "az");
  assert.equal(toAlpha(53), "ba");
  assert.equal(toAlpha(702), "zz");
  assert.equal(toAlpha(703), "aaa");
});

test("toAlpha falls back to plain digits for non-positive input", () => {
  assert.equal(toAlpha(0), "0");
  assert.equal(toAlpha(-3), "-3");
});

test("formatNumeral applies each style, including upper/lower casing", () => {
  assert.equal(formatNumeral(4, "arabic"), "4");
  assert.equal(formatNumeral(4, "roman-lower"), "iv");
  assert.equal(formatNumeral(4, "roman-upper"), "IV");
  assert.equal(formatNumeral(4, "alpha-lower"), "d");
  assert.equal(formatNumeral(4, "alpha-upper"), "D");
});

test("formatPageLabel renders each format template", () => {
  const base = { numeralStyle: "arabic" as const, prefix: "", suffix: "" };
  assert.equal(formatPageLabel(3, 10, { ...base, numberFormat: "number" }), "3");
  assert.equal(formatPageLabel(3, 10, { ...base, numberFormat: "page-x" }), "Page 3");
  assert.equal(formatPageLabel(3, 10, { ...base, numberFormat: "x-of-n" }), "Page 3 of 10");
  assert.equal(formatPageLabel(3, 10, { ...base, numberFormat: "x-slash-n" }), "3 / 10");
});

test("formatPageLabel applies prefix and suffix around the formatted core", () => {
  const label = formatPageLabel(2, 5, { numberFormat: "x-of-n", numeralStyle: "arabic", prefix: "- ", suffix: " -" });
  assert.equal(label, "- Page 2 of 5 -");
});

test("formatPageLabel formats both the displayed number and the total using the numeral style", () => {
  assert.equal(
    formatPageLabel(4, 10, { numberFormat: "x-of-n", numeralStyle: "roman-upper", prefix: "", suffix: "" }),
    "Page IV of X",
  );
});
