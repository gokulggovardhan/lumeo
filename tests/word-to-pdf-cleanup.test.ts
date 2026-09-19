import assert from "node:assert/strict";
import test from "node:test";

import {
  selectStaleWordToPdfObjectNames,
  WORD_TO_PDF_STALE_CUTOFF_MS,
} from "../lib/supabase/wordToPdfCleanup";

const NOW = Date.UTC(2026, 8, 20, 3, 0, 0);

test("selectStaleWordToPdfObjectNames only selects uploads older than two hours", () => {
  const result = selectStaleWordToPdfObjectNames(
    [
      { name: "old.docx", created_at: new Date(NOW - WORD_TO_PDF_STALE_CUTOFF_MS - 1).toISOString() },
      { name: "boundary.pdf", created_at: new Date(NOW - WORD_TO_PDF_STALE_CUTOFF_MS).toISOString() },
      { name: "fresh.docx", created_at: new Date(NOW - 60_000).toISOString() },
    ],
    NOW,
  );

  assert.deepEqual(result, ["old.docx"]);
});

test("selectStaleWordToPdfObjectNames preserves cleanup of malformed legacy objects", () => {
  const result = selectStaleWordToPdfObjectNames(
    [
      { name: "missing-timestamp.docx" },
      { name: "invalid-timestamp.pdf", created_at: "not-a-date" },
    ],
    NOW,
  );

  assert.deepEqual(result, ["missing-timestamp.docx", "invalid-timestamp.pdf"]);
});

test("selectStaleWordToPdfObjectNames treats the shared temp bucket uniformly", () => {
  const staleAt = new Date(NOW - WORD_TO_PDF_STALE_CUTOFF_MS - 1).toISOString();
  const result = selectStaleWordToPdfObjectNames(
    [
      { name: "word-upload.docx", created_at: staleAt },
      { name: "pdf-upload.pdf", created_at: staleAt },
    ],
    NOW,
  );

  assert.deepEqual(result, ["word-upload.docx", "pdf-upload.pdf"]);
});
