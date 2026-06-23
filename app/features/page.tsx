import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lumeo Features – Online Creative Studio for Short Videos",
  description:
    "Explore Lumeo features for uploading, trimming, reframing, adding titles, adjusting sound, and exporting polished short videos online.",
  alternates: {
    canonical: "https://lumeo.in/features",
  },
  openGraph: {
    title: "Lumeo Features",
    description:
      "Explore Lumeo features for creating polished short videos online.",
    url: "https://lumeo.in/features",
    siteName: "Lumeo",
    type: "website",
  },
};

const features = [
  {
    title: "Upload video",
    description:
      "Start with a source clip and bring it into a focused online editing workspace.",
  },
  {
    title: "Trim clips",
    description:
      "Set clean start and end points so your short video begins and ends with purpose.",
  },
  {
    title: "Reframe Studio",
    description:
      "Compose videos for vertical, square, and widescreen outputs with premium framing controls.",
  },
  {
    title: "Titles Studio",
    description:
      "Add polished title overlays with clean presets, positions, sizing, plates, and shadows.",
  },
  {
    title: "Sound controls",
    description:
      "Prepare audio levels as part of a simple creator-focused editing workflow.",
  },
  {
    title: "Export MP4",
    description:
      "Create clean MP4 downloads for social posts, creator projects, and short-form workflows.",
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      <nav className="border-b border-[#F3E7C8]/10 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E7C8] text-sm font-bold text-[#111018]">
              L
            </div>
            <span className="font-bold tracking-tight">Lumeo</span>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-[#F3E7C8]/10 px-4 py-2 text-sm font-semibold text-[#F7F0DE]/55 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
          Features
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Tools for turning raw clips into polished short videos.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F7F0DE]/55">
          Lumeo brings the essential creator workflow into one focused studio:
          upload, trim, reframe, title, adjust, and export.
        </p>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-6 transition hover:border-[#F3E7C8]/25 hover:bg-white/[0.055]"
            >
              <h2 className="text-lg font-bold">{feature.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#F7F0DE]/48">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-[#F3E7C8]/10 bg-[#101115] p-8">
          <h2 className="text-2xl font-bold">Built for focused creators</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            Lumeo is not trying to be a crowded editing suite. It is being
            built as a clean online creative studio for creators who want a
            simple, premium workflow for short-form video production.
          </p>
        </div>
      </section>

      <footer className="border-t border-[#F3E7C8]/10 px-6 py-8 text-center text-xs text-[#F7F0DE]/35">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-6">
          <Link href="/features" className="transition hover:text-white">
            Features
          </Link>
          <Link href="/about" className="transition hover:text-white">
            About
          </Link>
          <Link href="/privacy" className="transition hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:text-white">
            Terms
          </Link>
        </div>
        <p>© 2026 Lumeo. All rights reserved.</p>
        <p className="mt-1">Developed by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}