import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { requireAdmin } from "@/lib/admin/auth";
import { getHealthSnapshot, type HealthCheckStatus } from "@/lib/admin/health";
import { canViewHealth } from "@/lib/admin/permissions";
import { formatAdminDateTime } from "@/lib/admin/timezone";

export const dynamic = "force-dynamic";

const statusTone: Record<HealthCheckStatus, "success" | "warning" | "danger" | "neutral"> = {
  ok: "success",
  degraded: "warning",
  down: "danger",
  not_configured: "neutral",
};

const statusLabel: Record<HealthCheckStatus, string> = {
  ok: "Operational",
  degraded: "Degraded",
  down: "Down",
  not_configured: "Not configured",
};

export default async function HealthPage() {
  const admin = await requireAdmin();
  const canView = canViewHealth(admin.role);

  if (!canView) {
    return (
      <div className="space-y-7">
        <AdminPageHeader eyebrow="Operations" title="Health" description="Live status for the services Lumeo depends on." />
        <AdminEmptyState title="No access" description="Your role does not have permission to view this page." />
      </div>
    );
  }

  const snapshot = await getHealthSnapshot();
  const worst = snapshot.checks.some((check) => check.status === "down")
    ? "down"
    : snapshot.checks.some((check) => check.status === "degraded")
      ? "degraded"
      : "ok";

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations"
        title="Health"
        description="Live status for the services Lumeo depends on. Checked on every page load."
        meta={
          <p className="text-sm text-[var(--lumeo-paper-400)]">
            Overall: <span className="font-semibold text-[var(--lumeo-paper-50)]">{statusLabel[worst]}</span> · checked{" "}
            {formatAdminDateTime(snapshot.generatedAt)}
          </p>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {snapshot.checks.map((check) => (
          <AdminMetricCard
            key={check.name}
            label={check.name}
            value={statusLabel[check.status]}
            detail={check.latencyMs !== null ? `${check.detail} (${check.latencyMs}ms)` : check.detail}
            tone={statusTone[check.status]}
          />
        ))}
      </div>

      <AdminSectionCard title="Build" description="Version and deployment info for the currently running instance.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="aura-text-label text-[var(--lumeo-paper-400)]">App version</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--lumeo-paper-50)]">{snapshot.buildInfo.appVersion}</dd>
          </div>
          <div>
            <dt className="aura-text-label text-[var(--lumeo-paper-400)]">Environment</dt>
            <dd className="mt-1 text-sm font-semibold text-[var(--lumeo-paper-50)]">{snapshot.buildInfo.deploymentEnvironment}</dd>
          </div>
          <div>
            <dt className="aura-text-label text-[var(--lumeo-paper-400)]">Git commit</dt>
            <dd className="mt-1 font-mono text-sm text-[var(--lumeo-paper-50)]">
              {snapshot.buildInfo.gitCommitSha ? snapshot.buildInfo.gitCommitSha.slice(0, 12) : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="aura-text-label text-[var(--lumeo-paper-400)]">Deployment URL</dt>
            <dd className="mt-1 text-sm text-[var(--lumeo-paper-50)]">{snapshot.buildInfo.deploymentUrl ?? "Unavailable"}</dd>
          </div>
        </dl>
      </AdminSectionCard>
    </div>
  );
}
