import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Short Video Editor – Lumeo",
  description:
    "Create short videos online with Lumeo. Trim clips, reframe videos, add titles, prepare sound, and export polished MP4 clips for creator workflows.",
  alternates: {
    canonical: "https://lumeo.in/short-video-editor",
  },
  openGraph: {
    title: "Short Video Editor – Lumeo",
    description:
      "Use Lumeo to create polished short videos for creator and social workflows.",
    url: "https://lumeo.in/short-video-editor",
    siteName: "Lumeo",
    type: "website",
  },
};

const useCases = [
  {
    title: "Reels and Shorts",
    description:
      "Prepare clean short-form clips for vertical-first social platforms.",
  },
  {
    title: "Creator clips",
    description:
      "Turn raw creator footage into focused clips with clean framing and titles.",
  },
  {
    title: "Podcast moments",
    description:
      "Shape highlight clips from longer conversations and creator sessions.",
  },
  {
    title: "Educational clips",
    description:
      "Prepare short learning moments, explainers, and lesson highlights.",
  },
  {
    title: "Business content",
    description:
      "Create polished short videos for product updates and brand communication.",
  },
  {
    title: "Developer updates",
    description:
      "Prepare walkthroughs, screen-recording highlights, and product demos.",
  },
];

export default function ShortVideoEditorPage() {
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
          Short Video Editor
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Create clean short videos for social and creator workflows.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F7F0DE]/55">
          Lumeo gives creators a focused workflow for turning raw clips into
          polished short videos without unnecessary editing clutter.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#F3E7C8] px-6 py-3 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Open Studio
          </Link>

          <Link
            href="/online-video-editor"
            className="rounded-full border border-[#F3E7C8]/10 px-6 py-3 text-sm font-bold text-[#F7F0DE]/60 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Online video editor
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-6 transition hover:border-[#F3E7C8]/25 hover:bg-white/[0.055]"
            >
              <h2 className="text-lg font-bold">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#F7F0DE]/48">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-[#F3E7C8]/10 bg-[#101115] p-8">
          <h2 className="text-2xl font-bold">
            Built for focused short-form creation.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            Short video work should feel fast, clean, and intentional. Lumeo
            keeps the workflow focused on the core steps creators need to
            finish polished clips.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}