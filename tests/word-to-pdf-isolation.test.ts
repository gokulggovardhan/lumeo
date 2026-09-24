import assert from "node:assert/strict";
import test from "node:test";

import {
  isWordToPdfRoute,
  shouldReloadWordToPdfForIsolation,
} from "../lib/conversion/browser/wordToPdfIsolation.ts";

test("Word to PDF isolation recovery targets only the Office route", () => {
  assert.equal(isWordToPdfRoute("/pdf/word-to-pdf"), true);
  assert.equal(isWordToPdfRoute("/pdf/word-to-pdf/"), true);
  assert.equal(isWordToPdfRoute("/pdf/word-to-pdf/help"), true);
  assert.equal(isWordToPdfRoute("/pdf/pdf-to-word"), false);
  assert.equal(isWordToPdfRoute("/pdf-tools"), false);
});

test("client navigation to Word to PDF triggers one hard reload when not isolated", () => {
  assert.equal(
    shouldReloadWordToPdfForIsolation({
      pathname: "/pdf/word-to-pdf",
      crossOriginIsolated: false,
      previousAttempt: null,
    }),
    true,
  );
});

test("Word to PDF isolation recovery never reloads an already isolated document", () => {
  assert.equal(
    shouldReloadWordToPdfForIsolation({
      pathname: "/pdf/word-to-pdf",
      crossOriginIsolated: true,
      previousAttempt: null,
    }),
    false,
  );
});

test("Word to PDF isolation recovery prevents a reload loop", () => {
  assert.equal(
    shouldReloadWordToPdfForIsolation({
      pathname: "/pdf/word-to-pdf",
      crossOriginIsolated: false,
      previousAttempt: "/pdf/word-to-pdf",
    }),
    false,
  );
});

test("non-Office routes never trigger isolation recovery", () => {
  assert.equal(
    shouldReloadWordToPdfForIsolation({
      pathname: "/pdf-tools",
      crossOriginIsolated: false,
      previousAttempt: null,
    }),
    false,
  );
});
