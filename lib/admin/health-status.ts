export type HealthCheckStatus = "ok" | "degraded" | "down" | "not_configured";

export function summarizeHealthStatus(
  checks: ReadonlyArray<{ status: HealthCheckStatus }>,
): HealthCheckStatus {
  if (checks.some((check) => check.status === "down")) return "down";
  if (checks.some((check) => check.status === "degraded")) return "degraded";
  if (checks.some((check) => check.status === "not_configured")) {
    return "not_configured";
  }
  return "ok";
}
