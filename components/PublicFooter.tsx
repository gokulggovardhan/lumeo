// PublicFooter.tsx
import Link from "next/link";
import { BrandLockup } from "@/components/PublicPdfChrome";

const footerGroups = [
  {
    title: "Workspace",
    links: [
      { label: "PDF Tools", href: "/pdf" },
      { label: "Merge PDF", href: "/pdf/merge" },
      { label: "Split PDF", href: "/pdf/split" },
      { label: "Compress PDF", href: "/pdf/compress" },
    ],
  },
  {
    title: "Resources",
    links: [{ label: "Guides", href: "/guides" }],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Security", href: "/security" },
      { label: "Accessibility", href: "/accessibility" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#E8DFC8]/10 bg-[#0A101C] px-5 py-6 text-xs text-[#F0EAD6]/40 sm:px-8">
      <div className="mx-auto grid max-w-[1360px] gap-5 md:grid-cols-[0.75fr_2fr]">
        <Link
          href="/"
          className="max-w-xs transition opacity-90 hover:opacity-100"
        >
          <BrandLockup markSize="h-9 w-9" />
        </Link>

        <div className="grid gap-5 sm:grid-cols-4">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C9A84C]/72">
                {group.title}
              </p>
              <div className="mt-2.5 grid gap-1">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-[0.8rem] transition hover:text-[#F0EAD6] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="border-t border-[#E8DFC8]/8 pt-4 md:col-span-2 md:flex md:items-center md:justify-between md:gap-6">
          <p>&copy; {year} Lumeo PDF Workspace. All rights reserved.</p>
          <p className="mt-1.5 text-[#F0EAD6]/30 md:mt-0">
            Built by Govardhan Gudapakam
          </p>
        </div>
      </div>
    </footer>
  );
}