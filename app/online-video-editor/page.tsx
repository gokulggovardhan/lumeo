import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Online Video Editor – Lumeo",
  description:
    "Use Lumeo as an online video editor to upload, trim, reframe, add titles, adjust sound, and export polished short videos.",
  alternates: {
    canonical: "https://lumeo.in/online-video-editor",
  },
  openGraph: {
    title: "Online Video Editor – Lumeo",
    description:
      "Create polished short videos online with Lumeo's focused video editing workflow.",
    url: "https://lumeo.in/online-video-editor",
    siteName: "Lumeo",
    type: "website",
  },
};

const steps = [
  {
    title: "Upload your clip",
    description:
      "Start by adding a source video to your Lumeo project and prepare it for editing.",
  },
  {
    title: "Trim the video",
    description:
      "Set clean start and end points so the final clip stays focused and watchable.",
  },
  {
    title: "Reframe for output",
    description:
      "Use composition tools to prepare vertical, square, or widescreen versions.",
  },
  {
    title: "Add titles",
    description:
      "Place clean text overlays using creator-ready title styles and positions.",
  },
  {
    title: "Prepare sound",
    description:
      "Keep audio controls close to the editing workflow for a cleaner final result.",
  },
  {
    title: "Export MP4",
    description:
      "Create a polished MP4 download ready for social or creator workflows.",
  },
];

export default function OnlineVideoEditorPage() {
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
          Online Video Editor
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          A focused online video editor for clean short-form clips.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F7F0DE]/55">
          Lumeo helps creators edit videos online with a clean workflow for
          uploading, trimming, reframing, adding titles, adjusting sound, and
          exporting polished MP4 clips.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#F3E7C8] px-6 py-3 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Open Studio
          </Link>

          <Link
            href="/features"
            className="rounded-full border border-[#F3E7C8]/10 px-6 py-3 text-sm font-bold text-[#F7F0DE]/60 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            View features
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.035] p-6 transition hover:border-[#F3E7C8]/25 hover:bg-white/[0.055]"
            >
              <h2 className="text-lg font-bold">{step.title}</h2>
              <p className="mt-3 text-sm leading-6 text-[#F7F0DE]/48">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-[#F3E7C8]/10 bg-[#101115] p-8">
          <h2 className="text-2xl font-bold">
            Built for creators who want less clutter.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            Many video tools try to include everything at once. Lumeo focuses
            on the editing steps that matter for short videos: clean framing,
            simple titles, clear workflow, and export-ready output.
          </p>
        </div>
      </section>

      <footer className="border-t border-[#F3E7C8]/10 px-6 py-8 text-center text-xs text-[#F7F0DE]/35">
        <div className="mb-4 flex flex-wrap items-center justify-center gap-6">
          <Link href="/features" className="transition hover:text-white">
            Features
          </Link>
          <Link href="/online-video-editor" className="transition hover:text-white">
            Online Video Editor
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