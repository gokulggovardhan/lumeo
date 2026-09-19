import test from "node:test";
import assert from "node:assert/strict";
import { resolveAnalyticsRange } from "../lib/admin/analytics-range.ts";

const now = new Date("2026-09-19T12:00:00Z");

test("analytics ranges resolve against the IST calendar", () => {
  assert.deepEqual(resolveAnalyticsRange({ range: "today" }, now), {
    key: "today", label: "Today", startDate: "2026-09-19", endDate: "2026-09-19", warning: null,
  });
  assert.equal(resolveAnalyticsRange({ range: "yesterday" }, now).startDate, "2026-09-18");
  assert.equal(resolveAnalyticsRange({ range: "7d" }, now).startDate, "2026-09-13");
  assert.equal(resolveAnalyticsRange({ range: "30d" }, now).startDate, "2026-08-21");
  assert.equal(resolveAnalyticsRange({ range: "this-month" }, now).startDate, "2026-09-01");
});

test("previous month handles month boundaries", () => {
  const range = resolveAnalyticsRange({ range: "previous-month" }, new Date("2026-03-10T12:00:00Z"));
  assert.equal(range.startDate, "2026-02-01");
  assert.equal(range.endDate, "2026-02-28");
});

test("custom analytics range accepts at most 90 inclusive calendar days", () => {
  const valid = resolveAnalyticsRange({ range: "custom", start: "2026-06-22", end: "2026-09-19" }, now);
  assert.equal(valid.key, "custom");
  assert.equal(valid.warning, null);

  const invalid = resolveAnalyticsRange({ range: "custom", start: "2026-06-21", end: "2026-09-19" }, now);
  assert.equal(invalid.key, "7d");
  assert.match(invalid.warning ?? "", /90(?: calendar)? days/);
});

test("invalid custom ranges fail safely to the last seven days", () => {
  const reversed = resolveAnalyticsRange({ range: "custom", start: "2026-09-20", end: "2026-09-19" }, now);
  assert.equal(reversed.key, "7d");
  assert.ok(reversed.warning);

  const future = resolveAnalyticsRange({ range: "custom", start: "2026-09-19", end: "2026-09-20" }, now);
  assert.equal(future.key, "7d");
  assert.match(future.warning ?? "", /future/);
});
