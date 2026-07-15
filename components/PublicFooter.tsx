// components/PublicFooter.tsx

import Link from "next/link";
import { BrandLockup } from "@/components/PublicPdfChrome";
import { L2PublicFooter } from "@/components/ui/Aura";

const footerGroups = [
  {
    title: "Tools",
    links: [
      { label: "Merge PDF", href: "/pdf/merge" },
      { label: "Split PDF", href: "/pdf/split" },
      { label: "Compress PDF", href: "/pdf/compress" },
      { label: "All PDF Tools", href: "/pdf-tools" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Guides", href: "/guides" },
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Security", href: "/security" },
      { label: "Terms", href: "/terms" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <L2PublicFooter className="aura-public-footer bg-[linear-gradient(180deg,rgba(12,23,40,0.72),rgba(8,17,31,0.96))] px-5 text-sm text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,253,248,0.07)] sm:px-8">
      <div className="mx-auto grid max-w-[1160px] gap-8 py-9 md:grid-cols-[1.15fr_2fr]">
        <div>
          <BrandLockup markSize="h-10 w-10" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">
            Private, browser-first PDF tools.
          </p>
          <p className="mt-3 text-xs font-bold text-[var(--text-accent)]">Private by design · Clear handling</p>
        </div>
        <nav aria-label="Footer navigation" className="grid gap-6 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <p className="text-sm font-black text-[var(--text-primary)]">{group.title}</p>
              <ul className="mt-3 grid gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="rounded-[var(--radius-sm)] text-sm font-bold text-[var(--text-muted)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--sky-rgb),0.2)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="border-t border-[var(--border-hairline)] pt-5 text-xs text-[var(--text-muted)] md:col-span-2">&copy; {year} Lumeo PDF Workspace</p>
      </div>
    </L2PublicFooter>
  );
}
