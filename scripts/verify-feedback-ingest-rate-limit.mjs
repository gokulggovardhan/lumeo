import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminEmail = process.env.ADMIN_E2E_EMAIL;
const adminPassword = process.env.ADMIN_E2E_PASSWORD;

assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required.");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.");
assert.ok(adminEmail, "ADMIN_E2E_EMAIL is required.");
assert.ok(adminPassword, "ADMIN_E2E_PASSWORD is required.");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(url, anonKey, options);

function payload(label, sessionId) {
  return {
    p_type: "Query",
    p_name: "Feedback boundary test",
    p_subject: `Subject ${label}`,
    p_message: `Message ${label}`,
    p_email: "test@example.com",
    p_phone: null,
    p_location: "Test City, TS, IN",
    p_anonymous_session_id: sessionId,
  };
}

async function expectSuccess(client, args, label) {
  const { data, error } = await client.rpc("record_feedback_query", args);
  assert.equal(error, null, `${label}: ${error?.message ?? "unexpected RPC error"}`);
  assert.match(String(data), /^[0-9a-f-]{36}$/i, `${label}: expected UUID feedback id`);
  return data;
}

async function expectRateLimited(client, args, label) {
  const { error } = await client.rpc("record_feedback_query", args);
  assert.ok(error, `${label}: expected rate-limit error`);
  assert.match(error.message, /rate limit/i, `${label}: unexpected error ${error.message}`);
}

const directInsert = await anon.from("feedback_queries").insert({
  type: "Query",
  name: "Bypass attempt",
  subject: "Direct insert",
  message: "This must be rejected.",
});
assert.ok(directInsert.error, "anonymous direct table insert unexpectedly succeeded");

const invalidType = await anon.rpc("record_feedback_query", {
  ...payload("invalid-type", "11111111-1111-4111-8111-111111111111"),
  p_type: "Anything",
});
assert.ok(invalidType.error, "invalid feedback type unexpectedly succeeded");

const invalidEmail = await anon.rpc("record_feedback_query", {
  ...payload("invalid-email", "22222222-2222-4222-8222-222222222222"),
  p_email: "not-an-email",
});
assert.ok(invalidEmail.error, "invalid feedback email unexpectedly succeeded");

const sessionId = "33333333-3333-4333-8333-333333333333";
let firstId = null;
for (let i = 0; i < 5; i += 1) {
  const id = await expectSuccess(anon, payload(`session-${i}`, sessionId), `session request ${i + 1}`);
  if (i === 0) firstId = id;
}
await expectRateLimited(anon, payload("session-over-limit", sessionId), "session limit");

const authenticated = createClient(url, anonKey, options);
const { error: signInError } = await authenticated.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
assert.equal(signInError, null, signInError?.message ?? "admin sign-in failed");

const { data: stored, error: storedError } = await authenticated
  .from("feedback_queries")
  .select("id, type, name, email, subject, message, location")
  .eq("id", firstId)
  .single();
assert.equal(storedError, null, storedError?.message ?? "stored feedback read failed");
assert.equal(stored?.type, "Query");
assert.equal(stored?.email, "test@example.com");
assert.equal(stored?.location, "Test City, TS, IN");

const routeSource = readFileSync("app/api/feedback/route.ts", "utf8");
assert.ok(routeSource.includes('.rpc("record_feedback_query"'), "feedback API must use record_feedback_query RPC");
assert.ok(!routeSource.includes('.from("feedback_queries").insert'), "feedback API must not direct-insert into feedback_queries");

console.log("PASS feedback ingestion: RPC-only, validated, rate-limited, admin-readable");
