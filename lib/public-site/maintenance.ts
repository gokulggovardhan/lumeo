import "server-only";

import { createClient } from "@/lib/supabase/server";

export type PublicMaintenanceStatus = {
  enabled: boolean;
  title: string | null;
  message: string | null;
};

const DISABLED: PublicMaintenanceStatus = { enabled: false, title: null, message: null };

function parseMaintenanceStatus(value: unknown): PublicMaintenanceStatus {
  if (!value || typeof value !== "object") return DISABLED;
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === true,
    title: typeof record.title === "string" ? record.title : null,
    message: typeof record.message === "string" ? record.message : null,
  };
}

// Any failure here (unreachable DB, missing env, malformed response) must
// fail OPEN -- the site stays up -- never fail closed and lock visitors out
// because of an infrastructure hiccup unrelated to an intentional toggle.
export async function getPublicMaintenanceStatus(): Promise<PublicMaintenanceStatus> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_maintenance_status");
    if (error) return DISABLED;
    return parseMaintenanceStatus(data);
  } catch {
    return DISABLED;
  }
}
