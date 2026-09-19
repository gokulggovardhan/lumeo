"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminContextWithClient } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function signInAdmin(formData: FormData) {
  const email = getFormString(formData, "email").trim().toLowerCase();
  // Passwords are opaque credentials. Do not trim or otherwise normalize them:
  // whitespace may legitimately be part of a password.
  const password = getFormString(formData, "password");

  if (!email || !password) {
    redirect("/admin/login?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/admin/login?error=invalid");
  }

  // Authorize with the SAME client that established the session. Creating a
  // second server client here makes the result depend on whether newly-written
  // auth cookies are observable before this Server Action response is flushed,
  // which is an unnecessary browser/session propagation boundary.
  const context = await getAdminContextWithClient(supabase);

  if (!context.authorized) {
    await supabase.auth.signOut();
    revalidatePath("/admin", "layout");
    redirect("/admin/login?error=not-authorized");
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}
