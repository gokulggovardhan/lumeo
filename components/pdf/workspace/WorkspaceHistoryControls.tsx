"use client";

import { usePathname, useRouter } from "next/navigation";
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

  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 pt-3 sm:px-6 lg:px-8">
      <div
        aria-label="Workspace history"
        className="aura-glass-thin flex min-h-12 flex-wrap items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-hairline)] px-3 py-2 shadow-[var(--v2-elevation-1)]"
      >
        <span className="mr-1 text-xs font-extrabold text-[var(--text-secondary)]">
          Workspace changes
        </span>

        <button
          type="button"
          onClick={() => moveHistory("undo")}
          disabled={!globalHistory.canUndo}
          className="lumeo-focus-ring inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--border-selected)] hover:bg-[var(--surface-selected)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => moveHistory("redo")}
          disabled={!globalHistory.canRedo}
          className="lumeo-focus-ring inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--border-selected)] hover:bg-[var(--surface-selected)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Redo
        </button>

        {pathname !== "/pdf/finish" ? (
          <button
            type="button"
            onClick={() => router.push("/pdf/finish")}
            className="lumeo-focus-ring inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-selected)] bg-[var(--surface-selected)] px-3 text-sm font-extrabold text-[var(--text-primary)] transition hover:bg-[var(--surface-raised)]"
          >
            Finish
          </button>
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
