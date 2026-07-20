import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";
import { requireAdmin } from "@/lib/admin/auth";
import { lumeoTools } from "@/lib/tools/catalog";

// The homepage_tool_slots table and its assign form were retired once the
// public homepage moved to a fixed, curated set of dual-named tools (see
// lib/tools/catalog.ts) instead of five admin-picked flat actions. Keeping a
// working "Assign" button here would have quietly done nothing on the live
// site -- worse than removing it. What still controls the live homepage is
// each action's status/enabled state on the Tools page.
export default async function HomepagePage() {
  await requireAdmin();

  const previewTools = lumeoTools.filter((tool) => tool.availability === "available");

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Public launcher"
        title="Homepage"
        description="The homepage now shows a fixed, curated set of tools defined in code rather than five admin-assigned slots. This page is read-only; use PDF Tools to control which underlying actions are live."
      />
      <AdminSectionCard title="Live homepage tools" description="What actually renders on the public homepage right now, in order.">
        <div className="grid gap-3 md:grid-cols-3">
          {previewTools.map((tool) => (
            <div key={tool.key} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/72">{tool.plain}</p>
              <p className="mt-3 text-base font-semibold text-[#F0EAD6]">{tool.name}</p>
              <p className="mt-1 text-sm text-[#F0EAD6]/48">{tool.tag}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-[#1E6B4A]/40 bg-[#1E6B4A]/12 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#CBA052]/72">Permanent</p>
            <p className="mt-3 text-base font-semibold text-[#F0EAD6]">All PDF Tools</p>
            <p className="mt-1 text-sm text-[#F0EAD6]/48">Always shown as the closing card, linking to the full catalog.</p>
          </div>
        </div>
      </AdminSectionCard>
      <AdminSectionCard title="Changing what's shown" description="Two different things determine what a visitor actually sees.">
        <ul className="grid gap-2 text-sm leading-6 text-[#F0EAD6]/72">
          <li>
            <span className="font-semibold text-[#F0EAD6]">Which underlying action is live</span> — set on the{" "}
            <a href="/admin/tools" className="text-[#CBA052] underline underline-offset-2">PDF Tools</a> page (status, enabled). This
            still governs the whole site: nav, homepage, and the tools catalog.
          </li>
          <li>
            <span className="font-semibold text-[#F0EAD6]">The tool names, grouping, and order shown above</span> — a design decision
            defined in code (<code className="font-mono text-xs text-[#F0EAD6]/60">lib/tools/catalog.ts</code>), reviewed and changed via a
            pull request rather than this page.
          </li>
        </ul>
      </AdminSectionCard>
    </div>
  );
}
