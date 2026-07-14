import { AuraCard, AuraPageHeader, AuraPanel, AuraStatus } from "@/components/ui/Aura";
import {
  AdminDependencyList,
  AdminImpactPreview,
  AdminStoredOnlyNotice,
  AdminWhatThisControls,
} from "@/components/admin/guidance/AdminGuidance";

export default function AdminGuidePage() {
  return (
    <div className="grid gap-6">
      <AuraPageHeader
        eyebrow="Control Center"
        title="Guide foundation"
        description="A protected starting point for Run 2 guidance content. It explains controls without inventing runtime behaviour."
      />

      <AuraPanel>
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminWhatThisControls title="What this guide will do">
            Run 2 will attach contextual explanations to tools, settings, feature flags, analytics and homepage controls.
          </AdminWhatThisControls>
          <AdminImpactPreview
            enabled="Administrators see clear runtime impact before saving."
            disabled="Stored-only controls remain labelled honestly until public wiring exists."
          />
          <AdminDependencyList items={["Role permissions", "Audit logging", "Public runtime wiring", "Verification scripts"]} />
          <AdminStoredOnlyNotice />
        </div>
      </AuraPanel>

      <AuraCard>
        <div className="flex flex-wrap items-center gap-3">
          <AuraStatus tone="planned" label="Run 2 content" />
          <p className="text-sm leading-6 text-[var(--lumeo-paper-400)]">
            This route is protected by the existing admin layout and is intentionally not public-indexed.
          </p>
        </div>
      </AuraCard>
    </div>
  );
}
