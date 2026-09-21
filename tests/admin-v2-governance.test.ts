import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AUDIT_ENTITY_TYPES,
  filterAdminMembers,
  resolveAuditFilters,
  resolveMemberFilters,
} from "../lib/admin/governance-filters.ts";
import type { AdminMemberView } from "../lib/admin/data.ts";

const members: AdminMemberView[] = [
  {
    userId: "owner-id",
    email: "owner@lumeo.in",
    role: "owner",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSignInAt: null,
  },
  {
    userId: "analyst-id",
    email: "analyst@lumeo.in",
    role: "analyst",
    isActive: false,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lastSignInAt: null,
  },
];

test("Governance member filters normalize URL input and compose", () => {
  const filters = resolveMemberFilters({
    q: "  ANALYST ",
    role: "analyst",
    status: "deactivated",
  });
  assert.deepEqual(
    filterAdminMembers(members, filters).map((member) => member.userId),
    ["analyst-id"],
  );
  assert.equal(resolveMemberFilters({ role: "invalid", status: "invalid" }).role, "all");
});

test("Audit filters include every current audited entity and validate calendar ranges", () => {
  assert.ok(AUDIT_ENTITY_TYPES.includes("error_log"));
  assert.ok(AUDIT_ENTITY_TYPES.includes("admin_member"));

  const valid = resolveAuditFilters({
    action: " update ",
    entity_type: "error_log",
    start: "2026-09-01",
    end: "2026-09-21",
  });
  assert.equal(valid.dateError, null);
  assert.equal(valid.startIso, "2026-09-01T00:00:00.000Z");
  assert.equal(valid.endExclusiveIso, "2026-09-22T00:00:00.000Z");

  assert.match(resolveAuditFilters({ start: "2026-02-31" }).dateError ?? "", /valid calendar/);
  assert.match(
    resolveAuditFilters({ start: "2026-09-22", end: "2026-09-21" }).dateError ?? "",
    /start date/,
  );
  assert.equal(resolveAuditFilters({ entity_type: "secret" }).entityType, "");
});

test("Member actions prevent add-form privilege changes for existing administrators", () => {
  const action = readFileSync("app/admin/(protected)/members/actions.ts", "utf8");
  assert.match(action, /canManageMembers\(admin\.role\)/);
  assert.match(action, /getAdminMembers\(\)/);
  assert.match(action, /already an administrator/);
  assert.ok(action.indexOf("getAdminMembers()") < action.indexOf('.rpc("add_admin_member"'));
  assert.match(action, /writeAuditLog/);
});

test("Governance pages preserve authorization, truthful unavailable states, and exact pagination", () => {
  const membersPage = readFileSync("app/admin/(protected)/members/page.tsx", "utf8");
  const auditPage = readFileSync("app/admin/(protected)/audit/page.tsx", "utf8");

  assert.match(membersPage, /requireAdmin\(\)/);
  assert.match(membersPage, /canManageMembers\(admin\.role\)/);
  assert.match(membersPage, /Administrator data is unavailable/);
  for (const name of ["q", "role", "status"]) {
    assert.match(membersPage, new RegExp(`name="${name}"`));
  }

  assert.match(auditPage, /canViewAudit\(admin\.role\)/);
  assert.match(auditPage, /PAGE_SIZE \+ 1/);
  assert.match(auditPage, /hasNextPage/);
  assert.match(auditPage, /role="alert"/);
  assert.match(auditPage, /Audit records are unavailable/);
});
