// components/PublicFooter.tsx

import Link from "next/link";

const footerLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Security", href: "/security" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "/contact" },
];

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="aura-public-footer bg-[linear-gradient(180deg,rgba(12,22,38,0.72),rgba(8,16,29,0.96))] px-5 text-sm text-[var(--text-muted)] shadow-[inset_0_1px_0_rgba(255,253,247,0.06)] sm:px-8">
      <div className="mx-auto grid max-w-[1160px] gap-5 py-7 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="font-black text-[var(--text-primary)]">Lumeo PDF Workspace</p>
          <p className="mt-1 text-xs font-semibold text-[var(--text-muted)]">
            Private by design · Browser-first where possible · Built by Govardhan Gudapakam
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-full transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.2)]">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="text-xs text-[var(--text-muted)] sm:col-span-2">&copy; {year} Lumeo PDF Workspace</p>
      </div>
    </footer>
  );
}
