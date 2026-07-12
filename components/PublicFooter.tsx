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
    <footer className="border-t border-[#E8DFC8]/7 bg-[#090F1A] px-5 text-xs text-[#F0EAD6]/46 sm:px-8">
      <div className="mx-auto flex max-w-[1160px] flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {year} Lumeo PDF Workspace</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/40">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
