import assert from "node:assert/strict";
import test from "node:test";
import { formatAdminRelativeTime } from "../lib/admin/relative-time.ts";

const createdAt = "2026-09-23T12:00:00.000Z";
const createdAtMs = Date.parse(createdAt);

test("admin relative time is deterministic for a server-provided reference clock", () => {
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs), "just now");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 59_999), "just now");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 60_000), "1m ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 59 * 60_000), "59m ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 60 * 60_000), "1h ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 24 * 60 * 60_000), "1d ago");
});

test("admin relative time never depends on ambient Date.now during render", () => {
  const originalNow = Date.now;
  Date.now = () => createdAtMs + 10 * 24 * 60 * 60_000;
  try {
    assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 2 * 60_000), "2m ago");
  } finally {
    Date.now = originalNow;
  }
});

test("future timestamps fail closed to just now", () => {
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs - 60_000), "just now");
});
