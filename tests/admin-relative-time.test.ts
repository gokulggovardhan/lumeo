import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAdminRelativeTime,
  INITIAL_RELATIVE_TIME_REFERENCE_MS,
} from "../lib/admin/relative-time.ts";
import {
  formatAdminDate,
  formatAdminDateTime,
  istCalendarDateStartToUtcIso,
  istInputValueToUtcIso,
  utcIsoToIstInputValue,
} from "../lib/admin/timezone.ts";

const createdAt = "2026-09-23T12:00:00.000Z";
const createdAtMs = Date.parse(createdAt);

test("admin relative time is deterministic for a supplied reference clock", () => {
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs), "just now");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 59_999), "just now");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 60_000), "1m ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 59 * 60_000), "59m ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 60 * 60_000), "1h ago");
  assert.equal(formatAdminRelativeTime(createdAt, createdAtMs + 24 * 60 * 60_000), "1d ago");
});

test("initial hydration mode renders a stable absolute timestamp", () => {
  assert.equal(
    formatAdminRelativeTime(createdAt, INITIAL_RELATIVE_TIME_REFERENCE_MS),
    formatAdminDateTime(createdAt),
  );
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


test("admin absolute timestamps are always formatted in IST", () => {
  assert.match(formatAdminDateTime("2026-09-25T00:00:00.000Z"), /IST$/);
  assert.equal(formatAdminDate("2026-09-24T20:30:00.000Z"), "25 Sept 2026");
});

test("admin scheduling converts IST wall-clock values to UTC and back", () => {
  assert.equal(
    istInputValueToUtcIso("2026-09-25T10:00"),
    "2026-09-25T04:30:00.000Z",
  );
  assert.equal(
    utcIsoToIstInputValue("2026-09-25T04:30:00.000Z"),
    "2026-09-25T10:00",
  );
});

test("admin date filters convert IST midnight boundaries to UTC", () => {
  assert.equal(
    istCalendarDateStartToUtcIso("2026-09-25"),
    "2026-09-24T18:30:00.000Z",
  );
  assert.equal(
    istCalendarDateStartToUtcIso("2026-09-25", 1),
    "2026-09-25T18:30:00.000Z",
  );
  assert.equal(istCalendarDateStartToUtcIso("2026-02-31"), null);
});
