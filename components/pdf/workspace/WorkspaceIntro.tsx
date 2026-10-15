/**
 * Server-only, text-first Workspace introduction. Passing this server JSX
 * through the WorkspaceStart slot keeps the heading available before the
 * upload/session client code becomes interactive.
 */
export function WorkspaceIntro() {
  return (
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
  );
}
