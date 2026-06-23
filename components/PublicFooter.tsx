import Link from "next/link";

const productLinks = [
  {
    label: "Features",
    href: "/features",
  },
  {
    label: "Online Video Editor",
    href: "/online-video-editor",
  },
  {
    label: "Short Video Editor",
    href: "/short-video-editor",
  },
  {
    label: "Video Reframe Tool",
    href: "/video-reframe-tool",
  },
  {
    label: "Add Titles to Video",
    href: "/add-titles-to-video",
  },
];

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
    <footer className="border-t border-[#F3E7C8]/10 px-6 py-10 text-center text-xs text-[#F7F0DE]/35">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {productLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {trustLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="space-y-1">
          <p>© 2026 Lumeo. All rights reserved.</p>
          <p>Built by Govardhan Gudapakam</p>
        </div>
      </div>
    </footer>
  );
}