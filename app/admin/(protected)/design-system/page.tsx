"use client";

import { useState } from "react";
import {
  AuraBadge,
  AuraButton,
  AuraCard,
  AuraCheckbox,
  AuraCommandMenu,
  AuraDialog,
  AuraDrawer,
  AuraDropdown,
  AuraEmptyState,
  AuraFileCard,
  AuraFormField,
  AuraInput,
  AuraMetric,
  AuraNotice,
  AuraPageHeader,
  AuraPanel,
  AuraProgress,
  AuraResultCard,
  AuraRadioGroup,
  AuraSectionHeader,
  AuraSegmentedControl,
  AuraSelect,
  AuraSkeleton,
  AuraStatus,
  AuraSwitch,
  AuraTable,
  AuraTabs,
  AuraTextarea,
  AuraToast,
  AuraTooltip,
} from "@/components/ui/Aura";
import {
  AdminDependencyList,
  AdminImpactPreview,
  AdminRiskIndicator,
  AdminSettingExplanation,
  AdminStoredOnlyNotice,
  AdminWhatThisControls,
} from "@/components/admin/guidance/AdminGuidance";
import {
  ToolActionBar,
  ToolDocumentSummary,
  ToolModeCard,
  ToolOptionRow,
  ToolPrivacyNote,
  ToolProcessingStage,
  ToolResultStage,
  ToolSettingsStage,
  ToolUploadStage,
} from "@/components/pdf/workspace/ToolWorkspace";

const colourTokens = [
  "--canvas-950",
  "--canvas-850",
  "--paper-50",
  "--emerald-500",
  "--champagne-400",
  "--sky-400",
  "--ruby-500",
];

export default function DesignSystemPage() {
  const [switchOn, setSwitchOn] = useState(true);
  const [segment, setSegment] = useState("quality");
  const [radio, setRadio] = useState("owner");
  const [tab, setTab] = useState("controls");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="grid gap-8">
      <AuraPageHeader
        eyebrow="Lumeo 2.0"
        title="Lumeo Canvas"
        description="A private document studio with warm editorial detail, precise modern controls, tactile surfaces and reusable foundations for public tools and the Control Center."
        action={<AuraButton variant="premium" onClick={() => setDrawerOpen(true)}>Open drawer</AuraButton>}
      />

      <AuraPanel>
        <AuraSectionHeader title="Colour and surfaces" description="Semantic tokens keep Lumeo 2.0 consistent without hard-coded page styling." />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {colourTokens.map((token) => (
            <div key={token} className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-4">
              <div className="h-16 rounded-[var(--radius-lg)] border border-[var(--border-subtle)]" style={{ background: `var(${token})` }} />
              <p className="mt-3 font-mono text-xs text-[var(--lumeo-paper-200)]">{token}</p>
            </div>
          ))}
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Typography" description="Editorial display meets precise interface copy." />
        <div className="mt-5 grid gap-4">
          <p className="font-serif text-[var(--text-display-md)] leading-[var(--leading-display)] text-[var(--lumeo-paper-50)]">PDF work, thoughtfully refined.</p>
          <p className="text-[var(--text-heading-lg)] font-black text-[var(--lumeo-paper-50)]">Control Center heading</p>
          <p className="max-w-3xl text-[var(--text-body-md)] leading-[var(--leading-body)] text-[var(--lumeo-paper-400)]">
            Lumeo Aura keeps dense document operations readable at mobile sizes while preserving a premium sense of space on desktop.
          </p>
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Semantic text and depth" description="Readable text tokens and layered surfaces create hierarchy before borders." />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <AuraCard>
            <p className="text-sm font-black text-[var(--text-primary)]">Primary text</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">Secondary copy remains warm and readable on dark elevated surfaces.</p>
          </AuraCard>
          <AuraCard>
            <p className="text-sm font-black text-[var(--text-accent)]">Champagne detail</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">Gold is restrained for premium moments, not every button.</p>
          </AuraCard>
          <AuraCard>
            <p className="text-sm font-black text-[var(--text-info)]">Aura information</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-subtle)]">Cool light supports focus states and calm explanatory UI.</p>
          </AuraCard>
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Buttons, status and feedback" description="Seal Green carries primary action. Gold is reserved for premium emphasis." />
        <div className="mt-5 flex flex-wrap gap-3">
          <AuraButton>Primary action</AuraButton>
          <AuraButton variant="secondary">Secondary</AuraButton>
          <AuraButton variant="premium">Premium note</AuraButton>
          <AuraButton variant="success">Success</AuraButton>
          <AuraButton variant="ghost">Ghost</AuraButton>
          <AuraButton variant="danger">Careful action</AuraButton>
          <AuraButton variant="icon" aria-label="Icon button">⌘</AuraButton>
          <AuraButton loading>Loading</AuraButton>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <AuraBadge tone="success">Ready</AuraBadge>
          <AuraBadge tone="warning">Needs review</AuraBadge>
          <AuraBadge tone="planned">Stored only</AuraBadge>
          <AuraStatus tone="info" label="Browser-only" />
          <AuraTooltip label="Accessible tooltip foundation"><AuraBadge>Hover me</AuraBadge></AuraTooltip>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <AuraNotice tone="success" title="Success">The change was stored and audited.</AuraNotice>
          <AuraNotice tone="warning" title="Requires setup">Runtime wiring is planned for Run 2.</AuraNotice>
          <AuraToast tone="info" title="Toast foundation" message="Calm, concise, and non-blocking." />
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Forms and modern controls" description="Controls are tactile, labelled, keyboard-friendly and mobile-safe." />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="grid gap-4">
            <AuraFormField label="Workspace display name" description="Persistent labels stay visible.">
              <AuraInput placeholder="Lumeo PDF Workspace" />
            </AuraFormField>
            <AuraFormField label="Announcement copy">
              <AuraTextarea placeholder="Write a calm administrative message..." />
            </AuraFormField>
            <AuraFormField label="Environment">
              <AuraSelect defaultValue="production">
                <option value="production">Production</option>
                <option value="preview">Preview</option>
                <option value="development">Development</option>
              </AuraSelect>
            </AuraFormField>
            <AuraCommandMenu />
          </div>
          <div className="grid gap-4">
            <AuraSwitch checked={switchOn} onCheckedChange={setSwitchOn} label="Public analytics enabled" description="Optional discovery analytics. Do Not Track remains respected." impact={switchOn ? "Events are aggregated privately." : "No optional public analytics are recorded."} />
            <AuraCheckbox label="Require setup notice" description="The label remains primary, not colour alone." />
            <AuraRadioGroup label="Role" value={radio} onChange={setRadio} options={[{ value: "owner", label: "Owner" }, { value: "admin", label: "Admin" }, { value: "analyst", label: "Analyst" }]} />
            <AuraSegmentedControl label="Compression mode" value={segment} onChange={setSegment} options={[{ value: "quality", label: "Quality" }, { value: "target", label: "Target" }, { value: "custom", label: "Custom" }]} />
          </div>
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Cards, metrics and tables" description="Depth comes from surfaces and spacing before borders." />
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <AuraCard interactive>
            <p className="text-lg font-black text-[var(--lumeo-paper-50)]">Interactive card</p>
            <p className="mt-2 text-sm leading-6 text-[var(--lumeo-paper-400)]">Subtle lift and soft shadow support discoverability without theatrics.</p>
          </AuraCard>
          <AuraMetric label="Enabled tools" value="3" detail="Real values only." tone="success" />
          <AuraMetric label="Planned tools" value="2" detail="No fake usage totals." tone="planned" />
        </div>
        <div className="mt-5">
          <AuraTable headers={["Surface", "Purpose", "State"]} rows={[["Raised", "Tool panels", "Ready"], ["Floating", "Menus", "Interactive"], ["Input", "Fields", "Focused"]]} />
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Tool workspace foundations" description="Run 1 prepares shared structures without changing current PDF algorithms." />
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="grid gap-4">
            <ToolUploadStage action={<AuraButton>Select PDFs</AuraButton>} />
            <ToolDocumentSummary title="quarterly-report.pdf" details={["18 pages", "A4", "Browser-only"]} />
            <AuraFileCard
              name="document-slip.pdf"
              meta="2.4 MB · Custom page size"
              status="Ready"
              onMoveUp={() => undefined}
              onMoveDown={() => undefined}
              onRemove={() => undefined}
              action={<AuraBadge tone="success">Ready</AuraBadge>}
            />
          </div>
          <ToolSettingsStage title="Output">
            <ToolModeCard title="Smart document mode" description="A future shared mode card for tool settings." selected />
            <ToolOptionRow title="Clean margin" description="Compact controls stay readable." control={<AuraBadge tone="warning">Default</AuraBadge>} />
            <ToolProcessingStage />
            <ToolResultStage title="Result ready">Created locally in your browser.</ToolResultStage>
            <AuraResultCard
              title="Download ready"
              details={[{ label: "Handling", value: "Browser-only" }, { label: "State", value: "Cleared after download" }]}
              localMessage="No fake cloud-save wording. The file is yours."
              primaryAction={<AuraButton>Download</AuraButton>}
              secondaryAction={<AuraButton variant="secondary">Start new</AuraButton>}
            />
          </ToolSettingsStage>
        </div>
        <div className="mt-5">
          <ToolPrivacyNote />
        </div>
        <ToolActionBar>
          <AuraButton variant="secondary">Start over</AuraButton>
          <AuraButton>Run tool</AuraButton>
        </ToolActionBar>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Control Center guidance" description="Run 2 pages can explain what settings really control." />
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <AdminWhatThisControls title="What this controls">This foundation describes public-facing behaviour without pretending runtime wiring exists.</AdminWhatThisControls>
          <AdminImpactPreview enabled="The feature is visible to eligible users." disabled="The feature remains stored but inactive." />
          <AdminDependencyList items={["Supabase setting record", "Public catalog wiring", "Audit log entry"]} />
          <AdminSettingExplanation title="Homepage privacy message" runtime="Stored for future public wiring." deployment="No deployment is required after saving." history="Changes are audited when server actions wire this component." />
          <AdminStoredOnlyNotice />
          <div className="flex flex-wrap gap-2"><AdminRiskIndicator level="low" /><AdminRiskIndicator level="stored-only" /><AdminRiskIndicator level="requires-setup" /></div>
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Overlays and loading" action={<AuraDropdown label="Actions" items={[{ label: "Open dialog", onSelect: () => setDialogOpen(true) }, { label: "Open drawer", onSelect: () => setDrawerOpen(true) }]} />} />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <AuraTabs tabs={[{ value: "controls", label: "Controls", content: <AuraNotice tone="info" title="Tabs">Segmented tab foundation.</AuraNotice> }, { value: "states", label: "States", content: <AuraSkeleton className="h-24" /> }]} value={tab} onChange={setTab} />
          <AuraEmptyState title="No records yet" message="Empty states are useful, calm, and honest." action={<AuraButton variant="secondary">Learn more</AuraButton>} />
          <AuraProgress value={64} label="Readiness" />
        </div>
      </AuraPanel>

      <AuraPanel>
        <AuraSectionHeader title="Responsive and reduced-motion notes" description="The foundation is designed for 320px mobile through wide desktop, with no continuous decorative motion." />
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <AuraNotice tone="info" title="Mobile-safe controls">Touch targets aim for 44px where practical. Workspaces stack files, settings, action and result in a predictable order.</AuraNotice>
          <AuraNotice tone="planned" title="Reduced motion">Motion primitives collapse under prefers-reduced-motion while preserving state changes and focus visibility.</AuraNotice>
        </div>
      </AuraPanel>

      <AuraDialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Dialog foundation">
        <p className="text-sm leading-6 text-[var(--lumeo-paper-400)]">Escape closes this dialog. Run 2 can add stricter focus workflows where needed.</p>
      </AuraDialog>
      <AuraDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drawer foundation">
        <p className="text-sm leading-6 text-[var(--lumeo-paper-400)]">Drawers support mobile-safe editing, explanations, and compact admin workflows.</p>
      </AuraDrawer>
    </div>
  );
}
