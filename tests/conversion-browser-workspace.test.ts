import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CONVERSION_ORPHAN_MAX_AGE_MS,
  CONVERSION_WORKSPACE_DIRECTORIES,
  shouldRemoveConversionJob,
} from "../lib/conversion/browser/workspace.ts";

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);

function metadata(
  status: "created" | "running" | "completed" | "cancelled" | "failed",
  updatedAt: number,
) {
  return {
    version: 1 as const,
    jobId: "job-id",
    kind: "word-to-pdf" as const,
    status,
    createdAt: new Date(updatedAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
  };
}

test("orphan policy removes malformed, terminal and stale jobs", () => {
  assert.equal(shouldRemoveConversionJob(null, NOW), true);
  assert.equal(shouldRemoveConversionJob(metadata("completed", NOW), NOW), true);
  assert.equal(shouldRemoveConversionJob(metadata("cancelled", NOW), NOW), true);
  assert.equal(shouldRemoveConversionJob(metadata("failed", NOW), NOW), true);

  assert.equal(
    shouldRemoveConversionJob(
      metadata("running", NOW - CONVERSION_ORPHAN_MAX_AGE_MS - 1),
      NOW,
    ),
    true,
  );
});

test("orphan policy preserves fresh active jobs", () => {
  assert.equal(shouldRemoveConversionJob(metadata("created", NOW - 1_000), NOW), false);
  assert.equal(shouldRemoveConversionJob(metadata("running", NOW - 1_000), NOW), false);
});

test("workspace layout reserves reusable directories for later engines", () => {
  assert.deepEqual(CONVERSION_WORKSPACE_DIRECTORIES, [
    "input",
    "working",
    "pages",
    "images",
    "checkpoints",
    "output",
  ]);
});

test("workspace stages modern files by stream instead of ArrayBuffer duplication", async () => {
  const source = await readFile("lib/conversion/browser/workspace.ts", "utf8");

  assert.match(source, /blob\.stream\(\)\.pipeTo\(writable\)/);
  assert.doesNotMatch(source, /\.arrayBuffer\(/);
  assert.match(source, /navigator\.storage/);
  assert.match(source, /storage\.estimate/);
  assert.match(source, /getDirectory/);
  assert.match(source, /removeEntry/);
  assert.match(source, /showSaveFilePicker/);
});
