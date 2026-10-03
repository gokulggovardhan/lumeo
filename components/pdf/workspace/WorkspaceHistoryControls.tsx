"use client";

import { usePathname, useRouter } from "next/navigation";
import { AuraButton } from "@/components/ui/Aura";
import {
  continuationRouteForArea,
  type ContinuationArea,
} from "@/lib/pdf/workspace/continuation";
import { visibleWorkspaceHistory } from "@/lib/pdf/workspace/presentation";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

function routeForArea(area: WorkspaceArea): string {
  if (area === "export") return "/pdf/finish";
  return continuationRouteForArea(area as ContinuationArea);
}

export function WorkspaceHistoryControls() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    document,
    globalHistory,
    undoWorkspace,
    redoWorkspace,
    continueCurrent,
  } = useWorkspaceDocument();

  if (!globalHistory.connected || !document) return null;

  const recent = visibleWorkspaceHistory(
    document.session.history.operations,
    document.session.state.historyCursor,
    4,
  );

  function moveHistory(direction: "undo" | "redo") {
    const restored =
      direction === "undo" ? undoWorkspace() : redoWorkspace();
    if (!restored) return;
    router.push(routeForArea(restored.session.state.activeArea));
  }

  function moveTo(area: WorkspaceArea) {
    if (!continueCurrent(area)) return;
    router.push(routeForArea(area));
  }

  const desktopTools: readonly { area: WorkspaceArea; label: string }[] = [
    { area: "edit", label: "Edit" },
    { area: "pages", label: "Pages" },
    { area: "sign", label: "Sign" },
    { area: "enhance", label: "Add" },
    { area: "optimize", label: "Compress" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 pt-3 sm:px-6 lg:px-8">
      <div
        aria-label="Workspace history"
        className="aura-glass-thin flex min-h-12 flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-hairline)] px-3 py-2 shadow-[var(--v2-elevation-1)]"
      >
        <span className="mr-1 text-xs font-extrabold text-[var(--text-secondary)]">
          Workspace changes
        </span>

        <AuraButton
          type="button"
          variant="secondary"
          size="md"
          aria-label="Undo workspace change"
          onClick={() => moveHistory("undo")}
          disabled={!globalHistory.canUndo}
        >
          Undo
        </AuraButton>
        <AuraButton
          type="button"
          variant="secondary"
          size="md"
          aria-label="Redo workspace change"
          onClick={() => moveHistory("redo")}
          disabled={!globalHistory.canRedo}
        >
          Redo
        </AuraButton>

        <div
          className="hidden items-center gap-1 border-l border-[var(--border-hairline)] pl-2 lg:flex"
          aria-label="Workspace tools"
        >
          {desktopTools.map((tool) => (
            <button
              key={tool.area}
              type="button"
              onClick={() => moveTo(tool.area)}
              aria-current={
                pathname === routeForArea(tool.area) ? "page" : undefined
              }
              className="lumeo-focus-ring inline-flex min-h-10 items-center rounded-[var(--radius-md)] px-2.5 text-xs font-extrabold text-[var(--text-secondary)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] aria-[current=page]:bg-[var(--surface-selected)] aria-[current=page]:text-[var(--text-primary)]"
            >
              {tool.label}
            </button>
          ))}
        </div>

        {pathname !== "/pdf/finish" ? (
          <AuraButton
            type="button"
            variant="success"
            size="md"
            onClick={() => router.push("/pdf/finish")}
            className="hidden lg:inline-flex"
          >
            Finish
          </AuraButton>
        ) : null}

        {recent.length > 0 ? (
          <details className="ml-auto min-w-0 text-xs text-[var(--text-secondary)]">
            <summary className="lumeo-focus-ring cursor-pointer rounded-[var(--radius-sm)] px-2 py-1.5 font-bold">
              Recent changes
            </summary>
            <ol className="absolute right-4 z-30 mt-2 grid min-w-56 gap-1 rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-2 shadow-[var(--v2-elevation-3)] sm:right-6 lg:right-8">
              {recent.map((operation) => (
                <li
                  key={`${operation.area}:${operation.id}`}
                  className="rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-secondary)]"
                >
                  {operation.description}
                </li>
              ))}
            </ol>
          </details>
        ) : (
          <span className="ml-auto hidden text-xs text-[var(--text-subtle)] sm:inline">
            Continue working to build history.
          </span>
        )}
      </div>
    </div>
  );
}
