import "server-only";

import { summarizeHealthStatus, type HealthCheckStatus } from "@/lib/admin/health-status";
import { istIsoDate } from "@/lib/admin/timezone";
import { createClient } from "@/lib/supabase/server";

export type { HealthCheckStatus } from "@/lib/admin/health-status";

export type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  detail: string;
  latencyMs: number | null;
  required: boolean;
  href: string | null;
};

export type BuildInfo = {
  appVersion: string;
  gitCommitSha: string | null;
  deploymentEnvironment: string;
  deploymentUrl: string | null;
};

export type HealthSnapshot = {
  checks: HealthCheck[];
  overallStatus: HealthCheckStatus;
  buildInfo: BuildInfo;
  generatedAt: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; error: unknown; latencyMs: number }> {
  const start = Date.now();
  try {
    const result = await fn();
    return { result, error: null, latencyMs: Date.now() - start };
  } catch (error) {
    return { result: null, error, latencyMs: Date.now() - start };
  }
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function checkSupabaseDatabase(supabase: ServerSupabaseClient): Promise<HealthCheck> {
  const { result, error, latencyMs } = await timed(async () =>
    await supabase.from("pdf_tools").select("slug").limit(1),
  );

  if (error || result?.error) {
    return {
      name: "Supabase database",
      status: "down",
      detail: "Query failed.",
      latencyMs,
      required: true,
      href: null,
    };
  }

  return {
    name: "Supabase database",
    status: latencyMs > 2000 ? "degraded" : "ok",
    detail: latencyMs > 2000 ? "Reachable, but responding slowly." : "Reachable.",
    latencyMs,
    required: true,
    href: null,
  };
}

async function checkProtectedStore(
  supabase: ServerSupabaseClient,
  input: {
    name: string;
    table: "error_logs" | "feedback_queries";
    detail: string;
    href: string;
  },
): Promise<HealthCheck> {
  const { result, error, latencyMs } = await timed(async () =>
    await supabase.from(input.table).select("id").limit(1),
  );
  const unavailable = Boolean(error || result?.error);

  return {
    name: input.name,
    status: unavailable ? "down" : latencyMs > 2000 ? "degraded" : "ok",
    detail: unavailable
      ? "The protected data reader is unavailable."
      : latencyMs > 2000
        ? `${input.detail}, but the response was slow.`
        : `${input.detail}.`,
    latencyMs,
    required: false,
    href: input.href,
  };
}

async function checkAnalytics(supabase: ServerSupabaseClient): Promise<HealthCheck> {
  const today = istIsoDate();
  const { result, error, latencyMs } = await timed(async () =>
    await supabase.rpc("get_admin_analytics_summary", {
      p_start_date: today,
      p_end_date: today,
    }),
  );
  const unavailable = Boolean(error || result?.error);

  return {
    name: "Analytics aggregates",
    status: unavailable ? "down" : latencyMs > 2500 ? "degraded" : "ok",
    detail: unavailable
      ? "The protected analytics aggregate reader is unavailable."
      : latencyMs > 2500
        ? "The aggregate reader is available, but the response was slow."
        : "The protected aggregate reader is available.",
    latencyMs,
    required: false,
    href: "/admin/analytics",
  };
}

async function checkMaintenanceState(supabase: ServerSupabaseClient): Promise<HealthCheck> {
  const { result, error, latencyMs } = await timed(async () =>
    await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle(),
  );

  if (error || result?.error) {
    return {
      name: "Maintenance state",
      status: "down",
      detail: "The live maintenance setting could not be verified.",
      latencyMs,
      required: true,
      href: "/admin/settings",
    };
  }

  const value = result?.data?.value;
  const enabled = Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "enabled" in value &&
      value.enabled === true,
  );

  return {
    name: "Maintenance state",
    status: enabled ? "degraded" : "ok",
    detail: enabled
      ? "Global maintenance mode is enabled for public visitors."
      : "Global maintenance mode is disabled.",
    latencyMs,
    required: true,
    href: "/admin/settings",
  };
}

function getBuildInfo(): BuildInfo {
  return {
    appVersion: process.env.npm_package_version ?? "0.1.0",
    gitCommitSha: process.env.LUMEO_BUILD_SHA ?? null,
    deploymentEnvironment: process.env.LUMEO_DEPLOYMENT_ENV ?? "local",
    deploymentUrl: process.env.LUMEO_DEPLOYMENT_URL ?? null,
  };
}

function checkRuntime(buildInfo: BuildInfo): HealthCheck {
  const production = buildInfo.deploymentEnvironment === "production";
  const revisionKnown = Boolean(buildInfo.gitCommitSha);

  return {
    name: "Cloudflare runtime",
    status: production && revisionKnown ? "ok" : production ? "degraded" : "not_configured",
    detail:
      production && revisionKnown
        ? `Production revision ${buildInfo.gitCommitSha?.slice(0, 12)} is active.`
        : production
          ? "Production is active, but its build revision is unavailable."
          : "This request is not running in the production environment.",
    latencyMs: null,
    required: production,
    href: null,
  };
}

export async function getHealthSnapshot(context?: { adminRole?: string }): Promise<HealthSnapshot> {
  const supabase = await createClient();
  const buildInfo = getBuildInfo();
  const [database, analytics, errors, inbox, maintenance] = await Promise.all([
    checkSupabaseDatabase(supabase),
    checkAnalytics(supabase),
    checkProtectedStore(supabase, {
      name: "Error monitoring",
      table: "error_logs",
      detail: "The protected error log reader is available",
      href: "/admin/errors",
    }),
    checkProtectedStore(supabase, {
      name: "Feedback Inbox",
      table: "feedback_queries",
      detail: "The protected Inbox reader is available",
      href: "/admin/inbox",
    }),
    checkMaintenanceState(supabase),
  ]);
  const checks: HealthCheck[] = [
    {
      name: "Admin authorization",
      status: context?.adminRole ? "ok" : "not_configured",
      detail: context?.adminRole
        ? `The current ${context.adminRole} session passed server-side authorization.`
        : "No Admin authorization context was supplied for this snapshot.",
      latencyMs: null,
      required: true,
      href: null,
    },
    database,
    maintenance,
    analytics,
    errors,
    inbox,
    checkRuntime(buildInfo),
  ];

  return {
    checks,
    overallStatus: summarizeHealthStatus(checks),
    buildInfo,
    generatedAt: new Date().toISOString(),
  };
}
