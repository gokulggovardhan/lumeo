export type HealthCheckStatus = "ok" | "degraded" | "down" | "not_configured";

export type HealthStatusInput = {
  status: HealthCheckStatus;
  required: boolean;
};

export function summarizeHealthStatus(
  checks: ReadonlyArray<HealthStatusInput>,
): HealthCheckStatus {
  if (checks.some((check) => check.required && check.status === "down")) {
    return "down";
  }
  if (
    checks.some(
      (check) => check.required && check.status === "not_configured",
    )
  ) {
    return "not_configured";
  }
  if (checks.some((check) => check.required && check.status === "degraded")) {
    return "degraded";
  }
  if (
    checks.some(
      (check) =>
        !check.required &&
        (check.status === "degraded" || check.status === "down"),
    )
  ) {
    return "degraded";
  }
  return "ok";
}
