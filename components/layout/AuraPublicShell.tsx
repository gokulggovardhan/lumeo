import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { AuraButton, AuraStatus } from "@/components/ui/Aura";

export function AuraPublicNav({
  current = "Home",
  toolsMenu,
}: {
  current?: string;
  toolsMenu?: ReactNode;
}) {
  const links = [
    { href: "/", label: "Home" },
    { href: "/pdf-tools", label: "PDF Tools" },
    { href: "/guides", label: "Guides" },
    { href: "/privacy", label: "Privacy" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[rgba(255,253,247,0.72)] text-[var(--lumeo-ink-950)] shadow-[var(--shadow-xs)] backdrop-blur-xl">
      <nav className="aura-container flex min-h-16 items-center justify-between gap-4" aria-label="Public navigation">
        <Link href="/" className="rounded-[var(--radius-xl)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.22)]">
          <BrandLockup markSize="h-10 w-10" tone="dark" />
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current === link.label ? "page" : undefined}
              className="rounded-[var(--radius-pill)] px-3 py-2 text-sm font-extrabold text-[var(--lumeo-ink-750)] transition hover:bg-[rgba(var(--lumeo-seal-rgb),0.08)] hover:text-[var(--lumeo-ink-950)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
            >
              {link.label}
            </Link>
          ))}
          {toolsMenu}
        </div>
        <AuraButton size="sm">Start with Merge PDF</AuraButton>
      </nav>
    </header>
  );
}

export function AuraPublicFooter() {
  const groups = [
    { title: "Workspace", links: ["Merge PDF", "Split PDF", "Compress PDF", "All PDF Tools"] },
    { title: "Trust", links: ["Privacy", "Security", "Accessibility", "Terms"] },
    { title: "Learn", links: ["Guides", "About", "Contact"] },
  ];

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[rgba(255,253,247,0.9)] text-[var(--lumeo-ink-950)]">
      <div className="aura-container grid gap-8 py-10 md:grid-cols-[1.2fr_2fr]">
        <div>
          <BrandLockup markSize="h-10 w-10" tone="dark" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--lumeo-paper-600)]">
            A private, browser-first PDF workspace with calm controls and clear file handling.
          </p>
          <div className="mt-4">
            <AuraStatus tone="success" label="Private by design" />
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-sm font-black text-[var(--lumeo-ink-950)]">{group.title}</p>
              <ul className="mt-3 grid gap-2 text-sm text-[var(--lumeo-paper-600)]">
                {group.links.map((link) => <li key={link}>{link}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
