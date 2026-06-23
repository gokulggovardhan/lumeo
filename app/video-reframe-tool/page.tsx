import type { Metadata } from "next";
import Link from "next/link";
import PublicFooter from "@/components/PublicFooter";

export const metadata: Metadata = {
  title: "Video Reframe Tool – Lumeo",
  description:
    "Reframe videos online with Lumeo. Compose clips for vertical, square, and widescreen formats with a focused creator workflow.",
  alternates: {
    canonical: "https://lumeo.in/video-reframe-tool",
  },
  openGraph: {
    title: "Video Reframe Tool – Lumeo",
    description:
      "Use Lumeo to reframe videos online for short-form and social video outputs.",
    url: "https://lumeo.in/video-reframe-tool",
    siteName: "Lumeo",
    type: "website",
  },
};

const reframeFeatures = [
  {
    title: "Canvas formats",
    description:
      "Prepare videos for vertical, square, portrait, and widescreen outputs.",
  },
  {
    title: "Composition modes",
    description:
      "Choose how your clip sits inside the canvas with clean creator-focused framing.",
  },
  {
    title: "Subject size",
    description:
      "Adjust how close or wide the subject feels inside the final frame.",
  },
  {
    title: "Focus point",
    description:
      "Position the visual focus higher, lower, left, right, or centered.",
  },
  {
    title: "Safe zones",
    description:
      "Preview safe framing guidance while composing videos for social layouts.",
  },
  {
    title: "Export-ready output",
    description:
      "Apply framing decisions as part of the final short-video export workflow.",
  },
];

export default function VideoReframeToolPage() {
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
          Video Reframe Tool
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Reframe videos online for vertical, square, and widescreen outputs.
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#F7F0DE]/55">
          Lumeo’s Reframe Studio helps creators compose videos for different
          formats without turning the process into a complicated editing task.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#F3E7C8] px-6 py-3 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Open Studio
          </Link>

          <Link
            href="/short-video-editor"
            className="rounded-full border border-[#F3E7C8]/10 px-6 py-3 text-sm font-bold text-[#F7F0DE]/60 transition hover:border-[#F3E7C8]/30 hover:text-white"
          >
            Short video editor
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reframeFeatures.map((item) => (
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
            Built for social-first composition.
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F7F0DE]/55">
            A single source clip often needs more than one output format.
            Lumeo makes reframing part of the editing workflow so creators can
            prepare videos for short-form and social layouts with less
            friction.
          </p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}