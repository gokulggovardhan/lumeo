"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  continuationRouteForArea,
  type ContinuationArea,
} from "@/lib/pdf/workspace/continuation";
import type { WorkspaceArea } from "@/lib/pdf/workspace/model";
import { useWorkspaceDocument } from "./WorkspaceDocumentProvider";

const MOBILE_NAV_MEDIA = "(max-width: 1023px)";
const MOBILE_NAV_OFFSET = "4.5rem";

function routeForArea(area: WorkspaceArea): string {
  return continuationRouteForArea(area as ContinuationArea);
}

function isMoreArea(area: WorkspaceArea): boolean {
  return area === "sign" || area === "enhance" || area === "optimize";
}

export function WorkspaceMobileNav() {
  const router = useRouter();
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const moreOpen = openPath === pathname;
  const {
    document: workspaceDocument,
    continueCurrent,
  } = useWorkspaceDocument();

  useEffect(() => {
    if (!workspaceDocument || typeof window === "undefined") return;

    const media = window.matchMedia(MOBILE_NAV_MEDIA);
    const root = window.document.documentElement;

    function syncOffset() {
      if (media.matches) {
        root.style.setProperty("--workspace-mobile-nav-offset", MOBILE_NAV_OFFSET);
      } else {
        root.style.removeProperty("--workspace-mobile-nav-offset");
      }
    }

    syncOffset();
    media.addEventListener?.("change", syncOffset);
    return () => {
      media.removeEventListener?.("change", syncOffset);
      root.style.removeProperty("--workspace-mobile-nav-offset");
    };
  }, [workspaceDocument]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpenPath(null);
      moreButtonRef.current?.focus();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !wrapperRef.current?.contains(target)
      ) {
        setOpenPath(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [moreOpen]);

  if (!workspaceDocument) return null;

  const activeArea = workspaceDocument.session.state.activeArea;

  function moveTo(area: WorkspaceArea) {
    if (activeArea === area && pathname === routeForArea(area)) {
      setOpenPath(null);
      return;
    }
    if (!continueCurrent(area)) return;
    setOpenPath(null);
    router.push(routeForArea(area));
  }

  const directItems: Array<{
    area: WorkspaceArea;
    label: string;
  }> = [
    { area: "edit", label: "Edit" },
    { area: "pages", label: "Pages" },
  ];

  const moreItems: Array<{
    area: WorkspaceArea;
    label: string;
    detail: string;
  }> = [
    { area: "sign", label: "Sign", detail: "Signatures & initials" },
    { area: "enhance", label: "Add", detail: "Watermarks & numbering" },
    { area: "optimize", label: "Compress", detail: "Reduce file size" },
  ];

  return (
    <nav
      ref={wrapperRef}
      aria-label="PDF Workspace mobile navigation"
      data-workspace-mobile-nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-default)] bg-[var(--surface-overlay)] px-2 pt-2 shadow-[var(--v2-elevation-4)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {moreOpen ? (
        <div
          id="workspace-mobile-more"
          className="aura-menu-reveal absolute bottom-[calc(100%+0.5rem)] left-1/2 grid w-[min(calc(100vw-1rem),22rem)] -translate-x-1/2 gap-1 rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--surface-overlay)] p-2 shadow-[var(--v2-elevation-4)]"
        >
          {moreItems.map((item) => {
            const active = activeArea === item.area;
            return (
              <button
                key={item.area}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => moveTo(item.area)}
                className="lumeo-focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] px-3 py-2 text-left transition hover:bg-[var(--surface-selected)]"
              >
                <span>
                  <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                    {item.detail}
                  </span>
                </span>
                {active ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-accent)]">
                    Current
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mx-auto grid max-w-[30rem] grid-cols-4 gap-1">
        {directItems.map((item) => {
          const active = activeArea === item.area;
          return (
            <button
              key={item.area}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => moveTo(item.area)}
              className={
                "lumeo-focus-ring min-h-12 rounded-[var(--radius-lg)] px-2 text-xs font-extrabold transition " +
                (active
                  ? "bg-[var(--surface-selected)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]")
              }
            >
              {item.label}
            </button>
          );
        })}

        <button
          ref={moreButtonRef}
          type="button"
          aria-expanded={moreOpen}
          aria-controls="workspace-mobile-more"
          aria-current={isMoreArea(activeArea) ? "page" : undefined}
          onClick={() => setOpenPath(moreOpen ? null : pathname)}
          className={
            "lumeo-focus-ring min-h-12 rounded-[var(--radius-lg)] px-2 text-xs font-extrabold transition " +
            (isMoreArea(activeArea)
              ? "bg-[var(--surface-selected)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]")
          }
        >
          More
        </button>

        <button
          type="button"
          aria-current={activeArea === "export" ? "page" : undefined}
          onClick={() => moveTo("export")}
          className={
            "lumeo-focus-ring min-h-12 rounded-[var(--radius-lg)] px-2 text-xs font-black transition " +
            (activeArea === "export"
              ? "bg-[var(--surface-selected)] text-[var(--text-primary)]"
              : "bg-[var(--surface-success)] text-[var(--text-success)] hover:bg-[var(--surface-selected)]")
          }
        >
          Finish
        </button>
      </div>
    </nav>
  );
}
