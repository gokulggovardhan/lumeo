export function WorkspaceStartFirstPaint() {
  const steps = [
    ["Edit", "Edit text and document content"],
    ["Pages", "Reorder, rotate or delete pages"],
    ["Sign", "Add signatures and initials"],
    ["Add", "Watermarks, page numbers and headers"],
    ["Compress", "Reduce the final PDF size"],
  ] as const;

  return (
    <section
      className="grid gap-4 sm:gap-5"
      data-workspace-start-first-paint="true"
      aria-busy="true"
    >
      <div className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 shadow-[var(--v2-elevation-2)] sm:p-6">
        <div className="max-w-3xl">
          <p className="aura-text-label text-[var(--text-accent)]">
            UPLOAD ONCE · SWITCH TOOLS · DOWNLOAD ONCE
          </p>
          <h1 className="mt-2 font-serif text-[clamp(1.9rem,8vw,3.4rem)] font-semibold leading-[0.98] tracking-[-0.035em] text-[var(--text-primary)]">
            PDF Workspace
          </h1>
          <p className="mt-2.5 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:mt-3 sm:text-base">
            Keep one PDF open while you edit it, organize pages, sign, add
            watermarks or page numbers, compress, and finish with one final
            download.
          </p>
        </div>

        <div className="mt-5 sm:mt-6">
          <div className="rounded-[var(--radius-2xl)] border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.025)] p-5 text-center shadow-[var(--v2-elevation-1)] sm:p-6">
            <div className="mx-auto max-w-md">
              <p className="font-serif text-lg font-semibold text-[var(--text-primary)]">
                Upload one PDF to start
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Your PDF stays in browser memory while you move between compatible Workspace tools.
              </p>
              <span
                aria-hidden="true"
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-elevated)] px-6 py-3 text-sm font-extrabold text-[var(--text-muted)]"
              >
                Preparing Workspace…
              </span>
            </div>
          </div>
          <p className="mt-3 text-center text-sm leading-6 text-[var(--text-secondary)]">
            Your PDF is processed in your browser for supported Workspace actions.
          </p>
        </div>
      </div>

      <section
        aria-labelledby="workspace-first-paint-step"
        className="rounded-[var(--radius-2xl)] border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 shadow-[var(--v2-elevation-1)] sm:p-6"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="aura-text-label text-[var(--text-accent)]">WORKSPACE TOOLS</p>
            <h2
              id="workspace-first-paint-step"
              className="mt-1.5 font-serif text-[1.2rem] font-semibold text-[var(--text-primary)] sm:text-xl"
            >
              Upload once, then choose your first step.
            </h2>
          </div>
          <p className="max-w-md text-xs leading-5 text-[var(--text-muted)] sm:text-right">
            These tools share the same in-memory PDF. You can switch again without downloading and re-uploading the file.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 max-[330px]:grid-cols-1 sm:mt-5 sm:gap-2.5 md:grid-cols-5">
          {steps.map(([label, detail]) => (
            <div
              key={label}
              className="flex min-h-[5.75rem] flex-col justify-between rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[var(--surface-base)] p-3 opacity-45 sm:min-h-[6.25rem]"
            >
              <span className="font-serif text-[0.98rem] font-semibold text-[var(--text-primary)] sm:text-base">
                {label}
              </span>
              <span className="mt-2 text-[10.5px] leading-4 text-[var(--text-muted)] sm:text-[11px]">
                {detail}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-[var(--radius-xl)] border border-[var(--border-hairline)] bg-[rgba(var(--paper-rgb),0.02)] p-3.5">
        <p className="text-sm font-bold text-[var(--text-primary)]">Only need one quick task?</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">
          Every standalone PDF tool stays available and works normally.
        </p>
      </div>
    </section>
  );
}
