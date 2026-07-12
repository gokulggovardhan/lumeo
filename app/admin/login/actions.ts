"use server";

import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAdmin(formData: FormData) {
  const email = getFormValue(formData, "email").toLowerCase();
  const password = getFormValue(formData, "password");

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

  const context = await getAdminContext();

  if (!context.authorized) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not-authorized");
  }

  redirect("/admin");
}
