import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_TIMEZONE,
  ADMIN_TIMEZONE_LABEL,
  formatAdminDateTime,
  istDateEndExclusiveUtcIso,
  istDateStartUtcIso,
  istInputValueToUtcIso,
  istIsoDate,
  utcIsoToIstInputValue,
} from "../lib/admin/timezone.ts";

test("Admin timezone is fixed to Asia/Kolkata and absolute timestamps are labeled IST", () => {
  assert.equal(ADMIN_TIMEZONE, "Asia/Kolkata");
  assert.equal(ADMIN_TIMEZONE_LABEL, "IST");
  assert.match(formatAdminDateTime("2026-09-22T12:30:00.000Z"), /IST$/);
});

test("Admin datetime-local values round-trip between IST wall clock and UTC storage", () => {
  assert.equal(
    istInputValueToUtcIso("2026-09-22T18:00"),
    "2026-09-22T12:30:00.000Z",
  );
  assert.equal(
    utcIsoToIstInputValue("2026-09-22T12:30:00.000Z"),
    "2026-09-22T18:00",
  );
});

test("Admin calendar-day filters use midnight-to-midnight IST expressed as UTC instants", () => {
  assert.equal(istDateStartUtcIso("2026-09-22"), "2026-09-21T18:30:00.000Z");
  assert.equal(
    istDateEndExclusiveUtcIso("2026-09-22"),
    "2026-09-22T18:30:00.000Z",
  );
  assert.equal(istDateStartUtcIso("2026-02-31"), null);
  assert.equal(istDateEndExclusiveUtcIso("not-a-date"), null);
});

test("IST calendar date changes at India midnight rather than UTC midnight", () => {
  assert.equal(istIsoDate(new Date("2026-09-21T18:29:59.999Z")), "2026-09-21");
  assert.equal(istIsoDate(new Date("2026-09-21T18:30:00.000Z")), "2026-09-22");
});

test("Health analytics derives today from the shared IST calendar helper", () => {
  const health = readFileSync("lib/admin/health.ts", "utf8");
  assert.match(health, /const today = istIsoDate\(\);/);
  assert.doesNotMatch(health, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
