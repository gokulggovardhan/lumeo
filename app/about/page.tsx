import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "About Lumeo – Premium Online Creative Studio",
  description:
    "Learn about Lumeo, a premium online creative studio built for focused short-form video creation.",
  alternates: {
    canonical: "https://lumeo.in/about",
  },
  openGraph: {
    title: "About Lumeo",
    description:
      "Lumeo is a premium online creative studio built for focused short-form video creation.",
    url: "https://lumeo.in/about",
    siteName: "Lumeo",
    type: "website",
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      <nav className="border-b border-[#F3E7C8]/10 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
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

      <section className="mx-auto max-w-4xl px-6 py-20">
        <p className="mb-4 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
          About
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Lumeo is a focused creative studio for polished short videos.
        </h1>

        <div className="mt-10 space-y-7 text-base leading-8 text-[#F7F0DE]/60">
          <p>
            Lumeo is being built as a premium online creative studio for
            creators who want to turn raw clips into clean, polished short-form
            videos. The goal is to keep the editing experience focused, calm,
            and export-ready.
          </p>

          <p>
            Instead of copying large editing suites, Lumeo focuses on the
            creator workflow that matters most: upload a clip, trim it, reframe
            it, add titles, adjust sound, and export a clean video for social
            platforms and creator projects.
          </p>

          <p>
            The platform is designed for video creators, short-form content
            makers, educators, podcasters, developers, social media teams, and
            businesses that need a simple but premium editing workspace.
          </p>

          <p>
            Lumeo is still growing step by step. New features are added only
            when they improve the real editing workflow and maintain the clean,
            reliable studio experience.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-5">
            <h2 className="text-base font-bold">Focused</h2>
            <p className="mt-2 text-sm leading-6 text-[#F7F0DE]/45">
              Built around the essential creator workflow without unnecessary
              clutter.
            </p>
          </div>

          <div className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-5">
            <h2 className="text-base font-bold">Short-form first</h2>
            <p className="mt-2 text-sm leading-6 text-[#F7F0DE]/45">
              Designed for vertical, square, and widescreen creator outputs.
            </p>
          </div>

          <div className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-5">
            <h2 className="text-base font-bold">Premium feel</h2>
            <p className="mt-2 text-sm leading-6 text-[#F7F0DE]/45">
              A calm, polished workspace for creating clean video exports.
            </p>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}