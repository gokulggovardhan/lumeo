import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export async function writeAuditLog({
  action,
  entityType,
  entityId,
  summary,
  changes = null,
}: {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Json | null;
}) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("write_audit_log", {
    action: action.slice(0, 120),
    entity_type: entityType.slice(0, 80),
    entity_id: entityId ? entityId.slice(0, 120) : null,
    summary: summary.slice(0, 500),
    changes,
  });

  if (error) {
    return { ok: false as const };
  }

  return { ok: true as const };
}
