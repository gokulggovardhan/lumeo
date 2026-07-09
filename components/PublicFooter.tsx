import Link from "next/link";

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
          className="font-semibold text-[#F0EAD6]/68 transition hover:text-[#F0EAD6]"
        >
          Lumeo PDF Workspace
        </Link>

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
          <p>Built by Govardhan Gudapakam</p>
        </div>
      </div>
    </footer>
  );
}
