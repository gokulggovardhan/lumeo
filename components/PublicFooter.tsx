import Link from "next/link";
import { BrandLockup } from "@/components/PublicPdfChrome";

const trustLinks = [
  {
    label: "About",
    href: "/about",
  },
  {
    label: "Privacy",
    href: "/privacy",
  },
  {
    label: "Terms",
    href: "/terms",
  },
];

export default function PublicFooter() {
  return (
    <footer className="border-t border-[#E8DFC8]/12 px-6 py-10 text-center text-xs text-[#F0EAD6]/40">
      <div className="mx-auto flex max-w-[900px] flex-col items-center gap-6">
        <Link
          href="/"
          className="transition opacity-90 hover:opacity-100"
        >
          <BrandLockup markSize="h-9 w-9" />
        </Link>

        <div className="space-y-1">
          <p className="font-semibold text-[#F0EAD6]/66">Built by Govardhan Gudapakam</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {trustLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-[#F0EAD6]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="space-y-1">
          <p>2026 Lumeo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
