"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { writeAuditLog } from "@/lib/admin/audit";
import { canManageErrors } from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";
import { errorState, formString, successState } from "@/lib/admin/validation";
import type { ErrorStatus } from "@/lib/supabase/database.types";

const ERROR_VERIFICATION_WINDOW_MS = 24 * 60 * 60 * 1000;

async function managedErrorId(formData: FormData) {
  const admin = await requireAdmin();
  if (!canManageErrors(admin.role)) {
    return { error: errorState("You do not have permission to manage error logs.") } as const;
  }

  const id = formString(formData, "id", 40);
  if (!id) return { error: errorState("Choose a valid error log.") } as const;
  return { admin, id } as const;
}

async function auditStatus(
  id: string,
  status: ErrorStatus,
  summary: string,
) {
  await writeAuditLog({
    action: `error_log.${status}`,
    entityType: "error_log",
    entityId: id,
    summary,
  });
  revalidatePath("/admin/errors");
}

export async function acknowledgeErrorLog(formData: FormData) {
  const target = await managedErrorId(formData);
  if ("error" in target) return target.error;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("error_logs")
    .update({ status: "acknowledged" })
    .eq("id", target.id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error || !updated) return errorState("Only an open error can be acknowledged.");

  await auditStatus(
    target.id,
    "acknowledged",
    `Acknowledged error log #${target.id}; no fix is claimed yet.`,
  );
  return successState("Acknowledged.");
}

export async function markErrorFixDeployed(formData: FormData) {
  const target = await managedErrorId(formData);
  if ("error" in target) return target.error;

  const deployedSha = process.env.LUMEO_BUILD_SHA?.trim();
  if (!deployedSha) {
    return errorState("The deployed build SHA is unavailable; the fix cannot be verified yet.");
  }

  const now = new Date().toISOString();
  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("error_logs")
    .update({
      status: "fixed_pending_verification",
      last_fix_sha: deployedSha.slice(0, 40),
      fix_deployed_at: now,
      recurrence_after_fix: false,
      resolution_provenance: null,
      verified_at: null,
      resolved_at: null,
      resolved_by: null,
    })
    .eq("id", target.id)
    .in("status", ["open", "acknowledged"])
    .select("id")
    .maybeSingle();

  if (error || !updated) {
    return errorState("Only an open or acknowledged error can enter fix verification.");
  }

  await auditStatus(
    target.id,
    "fixed_pending_verification",
    `Recorded deployed fix ${deployedSha.slice(0, 12)} for error log #${target.id}; awaiting a 24-hour recurrence-free verification window.`,
  );
  return successState("Fix recorded; verification window started.");
}

export async function resolveErrorLog(formData: FormData) {
  const target = await managedErrorId(formData);
  if ("error" in target) return target.error;

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("error_logs")
    .select("id,status,fix_deployed_at,last_seen_at,recurrence_after_fix")
    .eq("id", target.id)
    .maybeSingle();

  if (readError || !current) return errorState("Error log could not be verified.");
  if (current.status !== "fixed_pending_verification" || !current.fix_deployed_at) {
    return errorState("Record the deployed fix before resolving this error.");
  }
  if (current.recurrence_after_fix) {
    return errorState("This error recurred after its fix and must be investigated again.");
  }

  const fixAt = Date.parse(current.fix_deployed_at);
  const lastSeenAt = Date.parse(current.last_seen_at);
  if (!Number.isFinite(fixAt) || Date.now() - fixAt < ERROR_VERIFICATION_WINDOW_MS) {
    return errorState("Keep this error in verification for at least 24 hours after deployment.");
  }
  if (Number.isFinite(lastSeenAt) && lastSeenAt > fixAt) {
    return errorState("A new occurrence was seen after the recorded fix.");
  }

  const { data: updated, error } = await supabase
    .from("error_logs")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: target.admin.userId,
      resolution_provenance: "verified_fix",
      verified_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .eq("status", "fixed_pending_verification")
    .select("id")
    .maybeSingle();

  if (error || !updated) return errorState("Error log could not be resolved.");

  await auditStatus(
    target.id,
    "resolved",
    `Resolved error log #${target.id} after its 24-hour recurrence-free verification window.`,
  );
  return successState("Resolved after verification.");
}

export async function ignoreErrorLog(formData: FormData) {
  const target = await managedErrorId(formData);
  if ("error" in target) return target.error;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("error_logs")
    .update({ status: "ignored" })
    .eq("id", target.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) return errorState("Error log could not be ignored.");

  await auditStatus(
    target.id,
    "ignored",
    `Ignored error log #${target.id}; future occurrences remain counted for audit history.`,
  );
  return successState("Ignored.");
}

export async function reopenErrorLog(formData: FormData) {
  const target = await managedErrorId(formData);
  if ("error" in target) return target.error;

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("error_logs")
    .update({
      status: "open",
      resolved_at: null,
      resolved_by: null,
      resolution_provenance: null,
      verified_at: null,
    })
    .eq("id", target.id)
    .select("id")
    .maybeSingle();

  if (error || !updated) return errorState("Error log could not be reopened.");

  await auditStatus(
    target.id,
    "open",
    `Reopened error log #${target.id} for investigation.`,
  );
  return successState("Reopened.");
}
