import assert from "node:assert/strict";
import test from "node:test";
import {
  applyInboxRealtimeEvent,
  selectedInboxIdAfterEvent,
} from "../lib/admin/inbox-realtime.ts";
import type { FeedbackQuery } from "../lib/supabase/database.types.ts";

function item(id: string, overrides: Partial<FeedbackQuery> = {}): FeedbackQuery {
  return {
    id,
    type: "Query",
    name: `User ${id}`,
    email: null,
    phone: null,
    subject: `Subject ${id}`,
    message: `Message ${id}`,
    location: null,
    is_read: false,
    created_at: "2026-09-19T12:00:00.000Z",
    ...overrides,
  };
}

test("Inbox realtime applies INSERT, UPDATE, and DELETE without duplicate rows", () => {
  let sessionA = [item("a"), item("b")];
  let sessionB = [...sessionA];

  const inserted = item("c", { subject: "New" });
  sessionA = applyInboxRealtimeEvent(sessionA, { type: "INSERT", row: inserted });
  sessionB = applyInboxRealtimeEvent(sessionB, { type: "INSERT", row: inserted });
  assert.deepEqual(sessionA.map((row) => row.id), ["c", "a", "b"]);
  assert.deepEqual(sessionB.map((row) => row.id), ["c", "a", "b"]);

  const updated = item("a", { is_read: true, subject: "Updated elsewhere" });
  sessionA = applyInboxRealtimeEvent(sessionA, { type: "UPDATE", row: updated });
  sessionB = applyInboxRealtimeEvent(sessionB, { type: "UPDATE", row: updated });
  assert.equal(sessionA.find((row) => row.id === "a")?.is_read, true);
  assert.equal(sessionB.find((row) => row.id === "a")?.subject, "Updated elsewhere");

  sessionA = applyInboxRealtimeEvent(sessionA, { type: "DELETE", id: "a" });
  sessionB = applyInboxRealtimeEvent(sessionB, { type: "DELETE", id: "a" });
  assert.equal(sessionA.some((row) => row.id === "a"), false);
  assert.equal(sessionB.some((row) => row.id === "a"), false);
  assert.equal(selectedInboxIdAfterEvent("a", { type: "DELETE", id: "a" }), null);
  assert.equal(selectedInboxIdAfterEvent("b", { type: "DELETE", id: "a" }), "b");
});

test("UPDATE for an unloaded Inbox row does not corrupt the loaded page", () => {
  const rows = [item("a")];
  const updated = applyInboxRealtimeEvent(rows, {
    type: "UPDATE",
    row: item("outside", { is_read: true }),
  });
  assert.deepEqual(updated, rows);
});
