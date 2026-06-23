import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Online Video Editor – Lumeo",
  description:
    "Edit videos online with Lumeo. Upload clips, trim videos, reframe for social formats, add titles, adjust sound, and export clean MP4 files.",
  alternates: {
    canonical: "https://lumeo.in/online-video-editor",
  },
  openGraph: {
    title: "Online Video Editor – Lumeo",
    description:
      "Use Lumeo as a focused online video editor for clean short-form clips.",
    url: "https://lumeo.in/online-video-editor",
    siteName: "Lumeo",
    type: "website",
  },
};

const steps = [
  {
    title: "Upload your clip",
    description:
      "Bring your video into a focused browser-based editing workspace.",
  },
  {
    title: "Trim the video",
    description:
      "Set clean start and end points to remove extra time from your clip.",
  },
  {
    title: "Reframe for output",
    description:
      "Compose your video for vertical, square, portrait, or widescreen formats.",
  },
  {
    title: "Add titles",
    description:
      "Place polished title overlays using clean, readable creator presets.",
  },
  {
    title: "Prepare sound",
    description:
      "Adjust audio as part of the final video preparation workflow.",
  },
  {
    title: "Export MP4",
    description:
      "Create a clean MP4 download for publishing and sharing.",
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
          Lumeo helps creators move from raw video to polished MP4 output with
          a clean online editing workflow built for speed and focus.
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
            Editing without unnecessary clutter.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            Lumeo is designed around the essential steps creators use most:
            trim, reframe, title, prepare sound, and export. The goal is a
            calm, premium editing experience that stays focused on finishing
            the clip.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}