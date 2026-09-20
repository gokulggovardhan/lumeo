import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.ADMIN_E2E_EMAIL;
const ownerPassword = process.env.ADMIN_E2E_PASSWORD;

assert.ok(url, "NEXT_PUBLIC_SUPABASE_URL is required.");
assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required.");
assert.ok(ownerEmail, "ADMIN_E2E_EMAIL is required.");
assert.ok(ownerPassword, "ADMIN_E2E_PASSWORD is required.");

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceRoleKey, options);
const submitter = createClient(url, anonKey, options);
const analystEmail = "analyst-e2e@lumeo.local";
const analystPassword = ownerPassword;

const { data: analystCreate, error: analystCreateError } =
  await service.auth.admin.createUser({
    email: analystEmail,
    password: analystPassword,
    email_confirm: true,
  });
assert.equal(
  analystCreateError,
  null,
  analystCreateError?.message ?? "failed to create analyst",
);
assert.ok(analystCreate.user);

const { error: analystMembershipError } = await service
  .from("admin_members")
  .upsert({
    user_id: analystCreate.user.id,
    role: "analyst",
    is_active: true,
  });
assert.equal(
  analystMembershipError,
  null,
  analystMembershipError?.message ?? "failed to create analyst membership",
);

// Seed through the same validated public RPC the production feedback route
// uses. Direct anonymous table INSERT is intentionally revoked.
const { data: messageId, error: insertError } = await submitter.rpc(
  "record_feedback_query",
  {
    p_type: "Query",
    p_name: "RLS Test",
    p_subject: "Analyst delete boundary",
    p_message: "Disposable isolated-Supabase test row.",
    p_email: null,
    p_phone: null,
    p_location: "Test City, TS, IN",
    p_anonymous_session_id: "22222222-2222-4222-8222-222222222222",
  },
);
assert.equal(insertError, null, insertError?.message ?? "failed to seed inbox row");
assert.ok(messageId, "feedback RPC did not return an inbox row id");

const analyst = createClient(url, anonKey, options);
const { error: analystSignInError } = await analyst.auth.signInWithPassword({
  email: analystEmail,
  password: analystPassword,
});
assert.equal(
  analystSignInError,
  null,
  analystSignInError?.message ?? "analyst sign-in failed",
);

const { data: readable, error: readError } = await analyst
  .from("feedback_queries")
  .select("id,is_read")
  .eq("id", messageId)
  .single();
assert.equal(readError, null, readError?.message ?? "analyst could not read inbox");
assert.equal(readable.id, messageId);

const { error: updateError } = await analyst
  .from("feedback_queries")
  .update({ is_read: true })
  .eq("id", messageId);
assert.equal(
  updateError,
  null,
  updateError?.message ?? "analyst could not mark inbox row read",
);

await analyst.from("feedback_queries").delete().eq("id", messageId);

const owner = createClient(url, anonKey, options);
const { error: ownerSignInError } = await owner.auth.signInWithPassword({
  email: ownerEmail,
  password: ownerPassword,
});
assert.equal(ownerSignInError, null, ownerSignInError?.message ?? "owner sign-in failed");

// Verify the analyst boundary through the real authenticated Admin path,
// not through service_role table access that production application code
// does not use for Inbox reads.
const { data: stillPresent, error: verifyAnalystDeleteError } = await owner
  .from("feedback_queries")
  .select("id,is_read")
  .eq("id", messageId)
  .single();
assert.equal(
  verifyAnalystDeleteError,
  null,
  verifyAnalystDeleteError?.message ?? "failed to verify analyst delete boundary",
);
assert.equal(stillPresent.id, messageId, "analyst unexpectedly deleted inbox row");
assert.equal(stillPresent.is_read, true, "analyst read-state update did not persist");

const { error: ownerDeleteError } = await owner
  .from("feedback_queries")
  .delete()
  .eq("id", messageId);
assert.equal(ownerDeleteError, null, ownerDeleteError?.message ?? "owner delete failed");

const { data: removedRows, error: removedCheckError } = await owner
  .from("feedback_queries")
  .select("id")
  .eq("id", messageId);
assert.equal(removedCheckError, null);
assert.deepEqual(removedRows, []);

console.log("PASS Admin Inbox RLS: analyst read/update allowed, delete denied; owner delete allowed");
