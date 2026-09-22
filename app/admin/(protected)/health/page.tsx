import Link from "next/link";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
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
  down: "Unavailable",
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

  const snapshot = await getHealthSnapshot({ adminRole: admin.role });
  const requiredChecks = snapshot.checks.filter((check) => check.required);
  const supportingChecks = snapshot.checks.filter((check) => !check.required);
  const groups = [
    {
      title: "Core operations",
      description: "Required checks determine whether Lumeo can operate safely.",
      checks: requiredChecks,
    },
    {
      title: "Supporting operations",
      description: "Optional operational readers can degrade without taking down the public product.",
      checks: supportingChecks,
    },
  ];

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operations"
        title="Health"
        description="Live status for the services Lumeo depends on. Checked on every page load."
        meta={
          <p className="text-sm text-[var(--lumeo-paper-400)]">
            Overall: <span className="font-semibold text-[var(--lumeo-paper-50)]">{statusLabel[snapshot.overallStatus]}</span> · checked{" "}
            {formatAdminDateTime(snapshot.generatedAt)}
          </p>
        }
      />

      {groups.map((group) => (
        <AdminSectionCard key={group.title} title={group.title} description={group.description}>
          <div className="divide-y divide-[var(--border-hairline)]">
            {group.checks.map((check) => (
              <div key={check.name} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{check.name}</p>
                    <AdminStatusBadge tone={statusTone[check.status]}>{statusLabel[check.status]}</AdminStatusBadge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                    {check.detail}{check.latencyMs !== null ? ` (${check.latencyMs}ms)` : ""}
                  </p>
                </div>
                {check.href && check.status !== "ok" ? (
                  <Link href={check.href} className="shrink-0 text-sm font-semibold text-[var(--text-accent)] hover:underline">
                    Review →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </AdminSectionCard>
      ))}

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
