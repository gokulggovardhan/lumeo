import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  conversionUserError,
  normalizeConversionError,
} from "../lib/conversion/errors.ts";

test("conversion errors expose stable user-facing categories without raw internals", () => {
  const protectedPdf = normalizeConversionError(
    new Error("PasswordException: encrypted object stream"),
    "input",
  );
  assert.equal(protectedPdf.code, "encrypted-input");
  assert.doesNotMatch(protectedPdf.message, /object stream/i);

  const runtime = normalizeConversionError(
    new Error("Office runtime manifest is unavailable (HTTP 503)."),
    "runtime",
  );
  assert.equal(runtime.code, "runtime-load-failed");
  assert.match(runtime.message, /local conversion engine/i);

  const unsupported = normalizeConversionError(
    new Error("SharedArrayBuffer is unavailable in this browser."),
    "runtime",
  );
  assert.equal(unsupported.code, "browser-unsupported");
  assert.equal(unsupported.recoverable, false);

  const output = normalizeConversionError(
    new Error("zip writer exploded"),
    "output",
  );
  assert.equal(output.code, "output-failed");
});

test("explicit conversion errors preserve category and recoverability", () => {
  const error = conversionUserError("file-too-large", {
    technicalMessage: "internal size detail",
  });
  assert.equal(error.code, "file-too-large");
  assert.equal(error.recoverable, true);
  assert.doesNotMatch(error.message, /internal size detail/);
  assert.equal(error.technicalMessage, "internal size detail");
});

test("premium converter UI uses meaningful stages, local privacy copy and accessible status", async () => {
  const [experience, word, pdf] = await Promise.all([
    readFile(
      "components/pdf/conversion/LocalConversionExperience.tsx",
      "utf8",
    ),
    readFile("components/pdf/WordToPdfTool.tsx", "utf8"),
    readFile("components/pdf/PdfToWordTool.tsx", "utf8"),
  ]);

  for (const label of [
    "Preparing document",
    "Loading conversion engine",
    "Processing document",
    "Generating PDF",
    "Finalizing file",
  ]) {
    assert.match(experience, new RegExp(label));
  }

  assert.match(
    experience,
    /Processed locally in your browser\. Your document is not uploaded for conversion\./,
  );
  assert.match(experience, /aria-current=\{current \? "step"/);
  assert.match(experience, /aria-live="polite"/);

  for (const source of [word, pdf]) {
    assert.match(source, /Replace file/);
    assert.match(source, /onRemove=\{isBusy \? undefined : resetTool\}/);
    assert.match(source, /Convert another/);
    assert.match(source, /Retry conversion/);
    assert.match(source, /aria-live="polite"/);
    assert.doesNotMatch(source, /processing_error/);
  }

  assert.match(
    pdf,
    /reconstructs an editable Word document while preserving the original layout as closely as possible/,
  );
});

test("Word engine reports stages rather than invented conversion percentages", async () => {
  const source = await readFile(
    "lib/conversion/browser/BrowserWordToPdfEngine.ts",
    "utf8",
  );

  assert.match(source, /phase: "loading-engine"/);
  assert.match(source, /phase: "generating"/);
  assert.match(source, /message: "Generating PDF"/);
  assert.doesNotMatch(source, /Math\.floor\(\(loaded \/ total\) \* 100\)/);
  assert.doesNotMatch(source, /%"/);
});
