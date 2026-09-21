import "server-only";

import { summarizeHealthStatus, type HealthCheckStatus } from "@/lib/admin/health-status";
import { createClient } from "@/lib/supabase/server";

export type { HealthCheckStatus } from "@/lib/admin/health-status";

export type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  detail: string;
  latencyMs: number | null;
  required: boolean;
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

async function checkSupabaseDatabase(): Promise<HealthCheck> {
  const supabase = await createClient();
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
    };
  }

  return {
    name: "Supabase database",
    status: latencyMs > 2000 ? "degraded" : "ok",
    detail: latencyMs > 2000 ? "Reachable, but responding slowly." : "Reachable.",
    latencyMs,
    required: true,
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

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const checks = [await checkSupabaseDatabase()];

  return {
    checks,
    overallStatus: summarizeHealthStatus(checks),
    buildInfo: getBuildInfo(),
    generatedAt: new Date().toISOString(),
  };
}
