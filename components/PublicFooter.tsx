import Link from "next/link";
import { BrandLockup } from "@/components/PublicPdfChrome";

const footerGroups = [
  {
    title: "Workspace",
    links: [
      { label: "PDF Tools", href: "/pdf" },
      { label: "Merge PDF", href: "/pdf/merge" },
      { label: "Split PDF", href: "/pdf/split" },
    ],
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
    <footer className="border-t border-[#E8DFC8]/12 bg-[#0A101C] px-6 py-8 text-xs text-[#F0EAD6]/42">
      <div className="mx-auto grid max-w-[1360px] gap-7 md:grid-cols-[1fr_1.8fr]">
        <Link
          href="/"
          className="max-w-xs transition opacity-90 hover:opacity-100"
        >
          <BrandLockup markSize="h-9 w-9" />
        </Link>

        <div className="grid gap-6 sm:grid-cols-3">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#C9A84C]">
                {group.title}
              </p>
              <div className="mt-3 grid gap-1.5">
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="text-sm transition hover:text-[#F0EAD6] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="border-t border-[#E8DFC8]/10 pt-5 md:col-span-2">
          <p className="font-semibold text-[#F0EAD6]/62">
            Built by Govardhan Gudapakam
          </p>
          <p className="mt-2">© {year} Lumeo PDF Workspace. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
