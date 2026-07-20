import Link from "next/link";
import { ToolGlyph } from "@/components/pdf/ToolGlyph";
import { pdfTools } from "@/components/pdf/PdfToolRegistry";
import type { ToolAction, ToolProcessing } from "@/lib/tools/catalog";
import { PROCESSING_LABEL } from "@/lib/tools/catalog";
import type { ResolvedTool } from "@/lib/tools/resolve";

// A tool bundles several actions that can point at the *same* route (Rotate,
// Remove pages, and Extract pages are all modes inside the one Split
// workspace). Grouping by resolved route -- instead of listing every action
// as an equal, separate destination -- is what keeps this page honest as a
// category grows: new modes slot in under their existing destination
// automatically, they don't need their own card or their own route.
function groupActions(actions: ToolAction[]) {
  const destinations: { headline: ToolAction; modes: ToolAction[] }[] = [];
  const byRoute = new Map<string, { headline: ToolAction; modes: ToolAction[] }>();
  const unrouted: ToolAction[] = [];

  for (const action of actions) {
    if (!action.live || !action.route) {
      if (!action.live) unrouted.push(action);
      continue;
    }
    const existing = byRoute.get(action.route);
    if (existing) {
      existing.modes.push(action);
    } else {
      const entry = { headline: action, modes: [] as ToolAction[] };
      byRoute.set(action.route, entry);
      destinations.push(entry);
    }
  }

  return { destinations, comingSoon: unrouted };
}

function ProcessingBadge({ processing }: { processing: ToolProcessing }) {
  const dotColor =
    processing === "browser"
      ? "var(--atelier-sage-300)"
      : processing === "server"
        ? "var(--atelier-brass-300)"
        : "var(--atelier-info)";
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-semibold text-[var(--text-muted)]">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
      {PROCESSING_LABEL[processing]}
    </span>
  );
}

export function ToolCategoryDetail({ tool }: { tool: ResolvedTool }) {
  const { destinations, comingSoon } = groupActions(tool.actions);
  const soonTool = tool.availability === "soon" || destinations.length === 0;

  return (
    <div>
      <Link
        href="/pdf-tools"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--atelier-sage-500)]"
      >
        <span aria-hidden="true">←</span>
        All PDF tools
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-base)] text-[var(--atelier-sage-300)]">
          <ToolGlyph name={tool.key} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">{tool.plain}</p>
          <h1 className="mt-0.5 font-serif text-[1.9rem] font-medium tracking-[-0.01em] text-[var(--text-primary)] sm:text-[2.15rem]">
            {tool.name}
          </h1>
          <p className="mt-2 max-w-[46rem] text-[14.5px] leading-relaxed text-[var(--text-secondary)]">{tool.tag}</p>
          {!soonTool ? (
            <div className="mt-2">
              <ProcessingBadge processing={tool.processing} />
            </div>
          ) : null}
        </div>
      </div>

      {destinations.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {destinations.map(({ headline, modes }) => {
            const registryEntry = pdfTools.find((entry) => entry.route === headline.route);
            return (
              <Link
                key={headline.slug}
                href={headline.route as string}
                className="group flex flex-col gap-2.5 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-raised)] p-4 transition duration-300 hover:-translate-y-1 hover:border-[var(--border-subtle)] hover:bg-[var(--surface-base)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-serif text-[1.15rem] font-medium text-[var(--text-primary)]">{headline.label}</span>
                  <span aria-hidden="true" className="text-[var(--text-premium)] transition group-hover:translate-x-0.5 motion-reduce:transform-none">→</span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {registryEntry?.description ?? `Open ${headline.label.toLowerCase()} in the ${tool.name} workspace.`}
                </p>
                {modes.length > 0 ? (
                  <p className="mt-auto text-[11.5px] leading-6 text-[var(--text-muted)]">
                    Also inside: {modes.map((mode) => mode.label).join(" · ")}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-8 rounded-[14px] border border-dashed border-[var(--border-subtle)] p-6 text-center">
          <p className="font-serif text-lg text-[var(--text-secondary)]">This workspace is being built.</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-muted)]">
            {`${tool.name} isn’t live yet — here’s what’s planned for it.`}
          </p>
        </div>
      )}

      {comingSoon.length > 0 ? (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-subtle)]">
            {destinations.length > 0 ? "Coming soon to this category" : "Planned"}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-[var(--text-muted)]">
            {comingSoon.map((action) => (
              <li key={action.slug} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--text-subtle)]" />
                {action.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
