import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_E2E_EMAIL;
const password = process.env.ADMIN_E2E_PASSWORD;

if (!url || !serviceRoleKey || !email || !password) {
  throw new Error("Missing local Supabase or disposable admin E2E environment variables.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error || !data.user) {
  throw error ?? new Error("Failed to create disposable local admin user.");
}

const { error: membershipError } = await supabase.from("admin_members").upsert({
  user_id: data.user.id,
  role: "owner",
  is_active: true,
});

if (membershipError) {
  throw membershipError;
}

console.log("Disposable local administrator created for browser E2E.");
