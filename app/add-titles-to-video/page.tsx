import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Add Titles to Video Online – Lumeo",
  description:
    "Add titles to videos online with Lumeo. Use clean title presets, positions, sizing, background plates, and shadows for polished short videos.",
  alternates: {
    canonical: "https://lumeo.in/add-titles-to-video",
  },
  openGraph: {
    title: "Add Titles to Video Online – Lumeo",
    description:
      "Use Lumeo to add clean, creator-ready titles to short videos online.",
    url: "https://lumeo.in/add-titles-to-video",
    siteName: "Lumeo",
    type: "website",
  },
};

const titleFeatures = [
  {
    title: "Title text",
    description:
      "Add a clear title or short message directly inside your video project.",
  },
  {
    title: "Style presets",
    description:
      "Choose from creator-ready title styles such as clean lower thirds, bold titles, minimal tags, and cinematic text.",
  },
  {
    title: "Position controls",
    description:
      "Place titles at the top, center, lower area, or bottom of the video frame.",
  },
  {
    title: "Text size",
    description:
      "Adjust title size so the text feels balanced for the video format.",
  },
  {
    title: "Background plate",
    description:
      "Use a clean background plate to improve readability when needed.",
  },
  {
    title: "Soft shadow",
    description:
      "Add subtle shadow styling to keep titles readable on different video backgrounds.",
  },
];

export default function AddTitlesToVideoPage() {
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
          Add Titles to Video
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Add clean, polished titles to videos online.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F7F0DE]/55">
          Lumeo’s Titles Studio helps creators add readable, polished text
          overlays to short videos with simple styling controls and
          creator-ready presets.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#F3E7C8] px-6 py-3 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Open Studio
          </Link>

          <Link
            href="/video-reframe-tool"
            className="rounded-full border border-[#F3E7C8]/10 px-6 py-3 text-sm font-bold text-[#F7F0DE]/60 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Video reframe tool
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {titleFeatures.map((item) => (
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
            Designed for readable creator titles.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            Short videos often need a clear title, label, or message. Lumeo
            keeps title creation simple with preset styles and practical
            controls that help text feel clean inside the final video.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}