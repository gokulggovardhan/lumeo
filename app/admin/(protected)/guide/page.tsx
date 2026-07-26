import { AuraCard, AuraPageHeader, AuraPanel, AuraStatus } from "@/components/ui/Aura";
import {
  AdminChangeSummary,
  AdminDependencyList,
  AdminGuideLink,
  AdminImpactPreview,
  AdminRiskIndicator,
  AdminSettingExplanation,
  AdminStoredOnlyNotice,
  AdminWhatThisControls,
} from "@/components/admin/guidance/AdminGuidance";

const guidanceModules = [
  {
    title: "PDF tool catalog",
    control: "Sets each tool's route, category, status, maintenance message, and enabled state. All 11 live tools have a database row and are fully wired to the nav, homepage, /pdf-tools catalog, and the tool's own page.",
    enabled: "The tool shows as live everywhere it's linked from, using the status set here (active, beta, coming_soon, hidden, or maintenance).",
    disabled: "The tool is immediately blocked on its own page (shows the maintenance message, if any) and hidden from the nav, homepage, and catalog.",
    dependencies: ["Supabase pdf_tools row", "resolveLumeoTools()", "getToolBlockedState()", "Audit logging"],
    risk: "medium" as const,
  },
  {
    title: "Homepage slots",
    control: "Stores the five configurable homepage tool positions. The sixth card remains All PDF Tools.",
    enabled: "A configured slot can point to an enabled homepage-eligible tool.",
    disabled: "Empty or ineligible slots are not promoted to public users.",
    dependencies: ["Homepage slots table", "Tool eligibility", "Future public wiring"],
    risk: "stored-only" as const,
  },
  {
    title: "Public analytics",
    control: "Controls optional privacy-preserving discovery analytics.",
    enabled: "Page views and tool opens may be recorded when visitors have not enabled Do Not Track.",
    disabled: "No optional public analytics are recorded.",
    dependencies: ["Site setting", "Do Not Track", "Public analytics RPC"],
    risk: "low" as const,
  },
  {
    title: "Feature flags",
    control: "Stores rollout switches for Lumeo capabilities.",
    enabled: "The flag is available for future runtime checks.",
    disabled: "The flag remains off until code reads it.",
    dependencies: ["Environment", "Flag key", "Runtime wiring"],
    risk: "requires-setup" as const,
  },
];

export default function AdminGuidePage() {
  return (
    <div className="grid gap-6">
      <AuraPageHeader
        eyebrow="Control Center"
        title="Admin guide"
        description="Practical guidance for changing Lumeo safely: what each control affects, what is stored only, and what still needs runtime wiring."
      />

      <AuraPanel>
        <div className="grid gap-4 xl:grid-cols-2">
          {guidanceModules.map((module) => (
            <AuraCard key={module.title}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black text-[var(--lumeo-paper-50)]">{module.title}</h2>
                <AdminRiskIndicator level={module.risk} />
              </div>
              <div className="mt-4 grid gap-4">
                <AdminWhatThisControls title="What this controls">{module.control}</AdminWhatThisControls>
                <AdminImpactPreview enabled={module.enabled} disabled={module.disabled} />
                <AdminDependencyList items={module.dependencies} />
              </div>
            </AuraCard>
          ))}
        </div>
      </AuraPanel>

      <AuraPanel>
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminSettingExplanation
            title="What happens when a live tool (e.g. Compress PDF) is disabled?"
            runtime="Takes effect immediately on save — the tool's own page shows the maintenance notice, and it drops out of the nav, homepage, and /pdf-tools catalog on the next request."
            deployment="No deployment is required. Public behaviour reads the pdf_tools row directly at request time."
            history="A management action writes an audit entry with the changed tool and status."
          />
          <AdminSettingExplanation
            title="What happens when public analytics is disabled?"
            runtime="The public analytics provider receives a disabled setting and does not record optional discovery events."
            deployment="No deployment is required. The setting is read at runtime."
            history="The settings action records the change without storing visitor identity."
          />
          <AdminSettingExplanation
            title="What happens when a homepage slot changes?"
            runtime="The stored slot assignment changes. The permanent sixth slot remains All PDF Tools and is never stored as a configurable row."
            deployment="No deployment is required to store the slot. Public homepage use depends on catalog wiring."
            history="The audit trail should summarize the slot number and target tool."
          />
          <AdminSettingExplanation
            title="What happens when SEO records change?"
            runtime="SEO records are stored in Supabase for managed pages. Dynamic public metadata wiring is separate and should be verified before relying on it."
            deployment="No deployment is required to store records. Public metadata changes require code paths that read those records."
            history="The audit entry should avoid secrets and preserve a concise summary."
          />
        </div>
      </AuraPanel>

      <AuraPanel>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <AuraCard>
            <h2 className="text-lg font-black text-[var(--lumeo-paper-50)]">Change review pattern</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">
              Before saving, Control Center pages should make the visible effect, dependencies, and risk clear. Stored-only controls must say so plainly.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <AuraStatus tone="success" label="Immediate" />
              <AuraStatus tone="planned" label="Stored only" />
              <AuraStatus tone="info" label="Requires setup" />
            </div>
          </AuraCard>
          <AdminChangeSummary
            changes={[
              { label: "Setting", value: "Homepage privacy message" },
              { label: "Runtime effect", value: "Stored only" },
              { label: "Deployment", value: "Not required" },
            ]}
          />
          <AdminImpactPreview
            enabled="Admins see the consequence before saving."
            disabled="Analysts see read-only context without write controls."
          />
          <AdminStoredOnlyNotice />
        </div>
      </AuraPanel>

      <AuraCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <AuraStatus tone="info" label="Protected guide" />
            <p className="text-sm leading-6 text-[var(--lumeo-paper-400)]">
              This route is protected by the existing admin layout and is intentionally not public-indexed.
            </p>
          </div>
          <AdminGuideLink href="/admin/design-system" label="Open design system" />
        </div>
      </AuraCard>

      <AuraCard>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Do</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">Explain concrete impact, permissions, and setup state before saving.</p>
          </div>
          <div>
            <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Do not</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">Promise public behaviour that is only stored in the Control Center.</p>
          </div>
          <div>
            <p className="text-sm font-black text-[var(--lumeo-paper-50)]">Tone</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">Calm, precise, and operational. No fake urgency or decorative claims.</p>
          </div>
        </div>
      </AuraCard>
    </div>
  );
}
