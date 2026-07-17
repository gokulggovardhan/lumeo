import type { ReactNode } from "react";
import { PublicPageShell } from "@/components/PublicPdfChrome";

export function PublicCatalogPageShell({
  children,
  maxWidth = "max-w-[1160px]",
  contentClassName = "px-5 py-8 sm:px-8 lg:py-10",
  mainClassName = "min-h-screen bg-[var(--surface-canvas)] text-[var(--text-primary)]",
}: {
  children: ReactNode;
  maxWidth?: string;
  contentClassName?: string;
  mainClassName?: string;
}) {
  return (
    <PublicPageShell
      maxWidth={maxWidth}
      contentClassName={contentClassName}
      mainClassName={mainClassName}
    >
      {children}
    </PublicPageShell>
  );
}
