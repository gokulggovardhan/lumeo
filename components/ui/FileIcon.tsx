export function FileIcon() {
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[rgb(var(--paper-rgb)/0.06)] text-[var(--text-secondary)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M6.5 3.8h7.8l3.2 3.2v13.2h-11V3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
        />
        <path
          d="M14.1 4v3.3h3.2M8.8 11.2h6.4M8.8 14h4.6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.55"
        />
      </svg>
    </span>
  );
}
