import assert from "node:assert/strict";
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
  const input = {
    message: `rate-limit-test-${label}`,
    stack: "<script>not-executed</script> token=should-not-matter",
    route: "/test/error-ingest",
    component: "ErrorRateLimitTest",
    source: "client",
    severity: "low",
    browser_family: "Chrome",
    operating_system: "Linux",
    device_class: "desktop",
    page_url: "http://127.0.0.1/test",
    build_version: "test",
    git_sha: "test",
  };
  if (sessionId !== undefined) input.anonymous_session_id = sessionId;
  return input;
}

async function expectSuccess(client, args, label) {
  const { data, error } = await client.rpc("record_error_event", args);
  assert.equal(error, null, `${label}: ${error?.message ?? "unexpected RPC error"}`);
  assert.equal(typeof data, "number", `${label}: expected numeric error log id`);
}

async function expectRateLimited(client, args, label) {
  const { error } = await client.rpc("record_error_event", args);
  assert.ok(error, `${label}: expected rate-limit error`);
  assert.match(error.message, /rate limit/i, `${label}: unexpected error ${error.message}`);
}

const sessionId = "11111111-1111-4111-8111-111111111111";
for (let i = 0; i < 40; i += 1) {
  await expectSuccess(anon, payload(`session-${i}`, sessionId), `session request ${i + 1}`);
}
await expectRateLimited(anon, payload("session-over-limit", sessionId), "session limit");

for (let i = 0; i < 40; i += 1) {
  await expectSuccess(anon, payload(`null-${i}`, undefined), `null-session request ${i + 1}`);
}
await expectRateLimited(anon, payload("null-over-limit", undefined), "null-session limit");

const authenticated = createClient(url, anonKey, options);
const { error: signInError } = await authenticated.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
assert.equal(signInError, null, signInError?.message ?? "authenticated sign-in failed");

for (let i = 0; i < 40; i += 1) {
  await expectSuccess(
    authenticated,
    { ...payload(`auth-${i}`, null), anonymous_session_id: null },
    `authenticated request ${i + 1}`,
  );
}
await expectRateLimited(
  authenticated,
  { ...payload("auth-over-limit", null), anonymous_session_id: null },
  "authenticated limit",
);

const { error: internalHelperError } = await anon.rpc("current_admin_role");
assert.ok(internalHelperError, "anon unexpectedly executed current_admin_role");

console.log("PASS error ingestion rate limits: session, null-session, authenticated, privileges");
