import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAnnouncementStatus } from "../lib/admin/announcement-status.ts";
import { validateAnnouncementSchedule } from "../lib/admin/validation.ts";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const now = new Date("2026-09-21T12:00:00.000Z");

test("announcement status distinguishes live, scheduled, expired, and inactive records", () => {
  assert.equal(resolveAnnouncementStatus({ isActive: false, startsAt: null, endsAt: null }, now), "inactive");
  assert.equal(resolveAnnouncementStatus({ isActive: true, startsAt: "2026-09-22T12:00:00.000Z", endsAt: null }, now), "scheduled");
  assert.equal(resolveAnnouncementStatus({ isActive: true, startsAt: null, endsAt: "2026-09-21T12:00:00.000Z" }, now), "expired");
  assert.equal(resolveAnnouncementStatus({ isActive: true, startsAt: "2026-09-20T12:00:00.000Z", endsAt: "2026-09-22T12:00:00.000Z" }, now), "live");
});

test("announcement schedule validation rejects malformed and non-increasing times", () => {
  assert.equal(validateAnnouncementSchedule("", ""), true);
  assert.equal(validateAnnouncementSchedule("2026-09-21T10:00", ""), true);
  assert.equal(validateAnnouncementSchedule("invalid", ""), false);
  assert.equal(validateAnnouncementSchedule("2026-02-31T10:00", ""), false);
  assert.equal(validateAnnouncementSchedule("2026-09-21T10:00", "2026-09-21T10:00"), false);
  assert.equal(validateAnnouncementSchedule("2026-09-21T10:00", "2026-09-21T10:01"), true);
});

test("announcement mutations require complete links and preserve authorization and auditing", () => {
  const action = read("app/admin/(protected)/announcements/actions.ts");
  assert.match(action, /canManageAnnouncements\(admin\.role\)/);
  assert.match(action, /Boolean\(linkLabel\) !== Boolean\(linkUrl\)/);
  assert.match(action, /Add both a link label and link URL/);
  assert.match(action, /await writeAuditLog/);
});

test("announcement page presents truthful schedule-aware states", () => {
  const page = read("app/admin/(protected)/announcements/page.tsx");
  assert.match(page, /resolveAnnouncementStatus/);
  for (const label of ["Inactive", "Scheduled", "Live", "Expired"]) {
    assert.match(page, new RegExp(`\\b${label}\\b`));
  }
  assert.doesNotMatch(page, /announcement\.is_active \? "Active" : "Inactive"/);
});

test("HEIC route consumes the same live SEO override as the Admin coverage registry", () => {
  const page = read("app/heic-to-jpeg/page.tsx");
  assert.match(page, /withSeoOverride\("\/heic-to-jpeg"/);
  assert.match(page, /export async function generateMetadata/);
  assert.doesNotMatch(page, /export const metadata/);
});
