"use client";

import { useRouter } from "next/navigation";
import { continuationRouteForArea, type ContinuationArea } from "@/lib/pdf/workspace/continuation";
import { getDocumentHealthSuggestions } from "@/lib/pdf/workspace/documentHealth";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

function routeForArea(area: WorkspaceArea): string {
  if (area === "export") return "/pdf/finish";
  return continuationRouteForArea(area as ContinuationArea);
}

export function WorkspaceDocumentHealth() {
  const router = useRouter();
  const {
    document,
    documentHealth,
    globalHistory,
    continueCurrent,
  } = useWorkspaceDocument();

  if (!document || !globalHistory.connected) return null;

  const derivedRotatedPageCount = document.session.state.document.pages.filter(
    (page) => !page.deleted && page.rotation !== 0,
  ).length;
  const rotatedPageCount = Math.max(
    documentHealth.rotatedPageCount ?? 0,
    derivedRotatedPageCount,
  );

  const suggestions = getDocumentHealthSuggestions({
    byteLength: document.revision.byteLength,
    pageCount: document.revision.pageCount,
    hasSearchableText: documentHealth.hasSearchableText,
    scannedPageCount: documentHealth.scannedPageCount,
    rotatedPageCount,
    imageHeavy: documentHealth.imageHeavy,
  })
    .filter(
      (suggestion, index, all) =>
        all.findIndex((candidate) => candidate.area === suggestion.area) === index,
    )
    .slice(0, 2);

  if (suggestions.length === 0) return null;

  function openArea(area: WorkspaceArea) {
    if (!continueCurrent(area)) return;
    router.push(routeForArea(area));
  }

  return (
    <aside
      aria-label="Document suggestions"
      className="mx-auto w-full max-w-[1480px] px-4 pt-2 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-2 rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.02)] px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <span className="shrink-0 text-xs font-extrabold text-[var(--text-subtle)]">
          Suggested
        </span>

        {suggestions.map((suggestion) => {
          const active = document.session.state.activeArea === suggestion.area;
          return (
            <div
              key={suggestion.id}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[rgba(var(--paper-rgb),0.035)] px-3 py-2 sm:min-w-[280px]"
            >
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  {suggestion.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-[var(--text-muted)]">
                  {suggestion.detail}
                </p>
              </div>
              {active ? (
                <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-bold text-[var(--text-subtle)]">
                  Available here
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => openArea(suggestion.area)}
                  className="lumeo-focus-ring inline-flex min-h-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--border-selected)] hover:bg-[var(--surface-selected)]"
                >
                  {suggestion.id === "ocr"
                    ? "Recognize text"
                    : suggestion.area === "pages"
                      ? "Fix rotation"
                      : "Reduce size"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
