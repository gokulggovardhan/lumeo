import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AdminContext, AdminMembership, AdminRole } from "@/lib/admin/types";

type VerifiedClaims = {
  sub?: unknown;
  email?: unknown;
};

type AdminSupabaseClient = Awaited<ReturnType<typeof createClient>>;

function isAdminRole(value: unknown): value is AdminRole {
  return value === "owner" || value === "admin" || value === "analyst";
}

function getClaimString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function getAdminContextWithClient(
  supabase: AdminSupabaseClient,
): Promise<AdminContext> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return {
      authenticated: false,
      authorized: false,
      userId: null,
      email: null,
      role: null,
    };
  }

  const claims = data.claims as VerifiedClaims;
  const userId = getClaimString(claims.sub);
  const email = getClaimString(claims.email);

  if (!userId) {
    return {
      authenticated: false,
      authorized: false,
      userId: null,
      email: null,
      role: null,
    };
  }

  const { data: membership } = await supabase
    .from("admin_members")
    .select("user_id, role, is_active, created_at, updated_at")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle<AdminMembership>();

  if (
    !membership ||
    membership.user_id !== userId ||
    !membership.is_active ||
    !isAdminRole(membership.role)
  ) {
    return {
      authenticated: true,
      authorized: false,
      userId,
      email,
      role: null,
    };
  }

  return {
    authenticated: true,
    authorized: true,
    userId,
    email,
    role: membership.role,
  };
}

const getRequestAdminContext = cache(async (): Promise<AdminContext> => {
  const supabase = await createClient();
  return getAdminContextWithClient(supabase);
});

export async function getAdminContext(): Promise<AdminContext> {
  return getRequestAdminContext();
}

export async function requireAdmin() {
  const context = await getAdminContext();

  if (!context.authenticated) {
    redirect("/admin/login");
  }

  if (!context.authorized) {
    redirect("/admin/login?error=not-authorized");
  }

  return context;
}
