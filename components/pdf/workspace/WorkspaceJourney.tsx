/**
 * A visual guide only: this component does not own, persist or mutate PDFs.
 * The shared Workspace session remains the sole source of document identity.
 */
export type WorkspaceJourneyStage = "upload" | "work" | "finish";

const JOURNEY = [
  { id: "upload", label: "Upload", detail: "Choose one PDF" },
  { id: "work", label: "Work", detail: "Switch tools" },
  { id: "finish", label: "Finish", detail: "Download once" },
] as const;

export function WorkspaceJourney({ stage }: { stage: WorkspaceJourneyStage }) {
  const currentIndex = JOURNEY.findIndex((item) => item.id === stage);

  return (
    <ol
      aria-label="PDF Workspace flow"
      data-workspace-onboarding="true"
      data-workspace-onboarding-stage={stage}
      className="mt-4 grid grid-cols-3 gap-1.5 sm:mt-5 sm:gap-2"
    >
      {JOURNEY.map((item, index) => {
        const completed = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li
            key={item.id}
            data-workspace-step={item.id}
            data-workspace-step-status={completed ? "complete" : current ? "current" : "upcoming"}
            aria-current={current ? "step" : undefined}
            className={[
              "min-w-0 rounded-[var(--radius-lg)] border px-2 py-2.5 sm:px-3",
              current
                ? "border-[var(--border-selected)] bg-[var(--surface-selected)]"
                : "border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.025)]",
            ].join(" ")}
          >
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span
                aria-hidden="true"
                className={[
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
                  current || completed
                    ? "bg-[var(--surface-selected)] text-[var(--text-accent)]"
                    : "bg-[var(--surface-base)] text-[var(--text-muted)]",
                ].join(" ")}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-4 text-[var(--text-muted)] sm:text-[11px]">
                  {item.detail}
                </p>
              </div>
            </div>
            <span className="sr-only">
              {completed ? "Completed step" : current ? "Current step" : "Upcoming step"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
