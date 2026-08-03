import "server-only";

import { createClient } from "@/lib/supabase/server";

export type HealthCheckStatus = "ok" | "degraded" | "down" | "not_configured";

export type HealthCheck = {
  name: string;
  status: HealthCheckStatus;
  detail: string;
  latencyMs: number | null;
};

export type BuildInfo = {
  appVersion: string;
  gitCommitSha: string | null;
  deploymentEnvironment: string;
  deploymentUrl: string | null;
};

export type HealthSnapshot = {
  checks: HealthCheck[];
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
  const { error, latencyMs } = await timed(async () => {
    return await supabase.from("pdf_tools").select("id", { count: "exact", head: true });
  });

  if (error) {
    return { name: "Supabase database", status: "down", detail: "Query failed.", latencyMs };
  }

  return {
    name: "Supabase database",
    status: latencyMs > 2000 ? "degraded" : "ok",
    detail: latencyMs > 2000 ? "Reachable, but responding slowly." : "Reachable.",
    latencyMs,
  };
}

async function checkSupabaseStorage(): Promise<HealthCheck> {
  const supabase = await createClient();
  const { result, error, latencyMs } = await timed(() => supabase.storage.listBuckets());

  if (error || result?.error) {
    return { name: "Supabase storage", status: "down", detail: "Bucket list failed.", latencyMs };
  }

  return { name: "Supabase storage", status: "ok", detail: "Reachable.", latencyMs };
}

async function checkLibreOfficeConverter(): Promise<HealthCheck> {
  const baseUrl = process.env.WORD_TO_PDF_CONVERTER_URL;
  if (!baseUrl) {
    return { name: "LibreOffice converter", status: "not_configured", detail: "WORD_TO_PDF_CONVERTER_URL is not set.", latencyMs: null };
  }

  const { result, error, latencyMs } = await timed(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(new URL("/healthz", baseUrl), { signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(timeout);
    }
  });

  if (error || !result) {
    return { name: "LibreOffice converter", status: "down", detail: "Request failed or timed out.", latencyMs };
  }

  if (!result.ok) {
    return { name: "LibreOffice converter", status: "down", detail: `Responded with HTTP ${result.status}.`, latencyMs };
  }

  return {
    name: "LibreOffice converter",
    status: latencyMs > 3000 ? "degraded" : "ok",
    detail: latencyMs > 3000 ? "Reachable, but responding slowly." : "Reachable.",
    latencyMs,
  };
}

function getBuildInfo(): BuildInfo {
  return {
    appVersion: process.env.npm_package_version ?? "0.1.0",
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentEnvironment: process.env.VERCEL_ENV ?? "local",
    deploymentUrl: process.env.VERCEL_URL ?? null,
  };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const [database, storage, libreOffice] = await Promise.all([
    checkSupabaseDatabase(),
    checkSupabaseStorage(),
    checkLibreOfficeConverter(),
  ]);

  return {
    checks: [database, storage, libreOffice],
    buildInfo: getBuildInfo(),
    generatedAt: new Date().toISOString(),
  };
}
