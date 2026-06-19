import Link from "next/link";
import AuthButton from "@/components/AuthButton";

const tools = [
  {
    title: "Trim",
    description: "Set clean start and end points.",
  },
  {
    title: "Frame",
    description: "Choose vertical, square, or widescreen.",
  },
  {
    title: "Titles",
    description: "Add simple text when you need it.",
  },
  {
    title: "Sound",
    description: "Balance your clip and music.",
  },
  {
    title: "Export",
    description: "Create a polished MP4 download.",
  },
  {
    title: "Auto-save",
    description: "Keep your media saved as you work.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      <nav className="relative z-50 border-b border-[#F3E7C8]/10 bg-[#07070A]/90 px-5 py-3.5 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E7C8] text-sm font-bold text-[#111018]">
              L
            </div>
            <span className="text-base font-bold tracking-tight">Lumeo</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-semibold text-[#F7F0DE]/55 md:flex">
            <a href="#tools" className="transition hover:text-white">
              Tools
            </a>
            <a href="#studio" className="transition hover:text-white">
              Studio
            </a>
          </div>

          <AuthButton />
        </div>
      </nav>

      <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_32%_0%,rgba(167,139,250,0.14),transparent_58%),radial-gradient(circle_at_74%_8%,rgba(244,114,182,0.10),transparent_42%)]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#F3E7C8]/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-bold text-[#F7F0DE]/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F3E7C8]" />
              Lumeo Studio
            </div>

            <h1 className="max-w-xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.25rem]">
              Create clean
              <br />
              <span className="text-[#F3E7C8]">short videos.</span>
            </h1>

            <p className="mt-6 max-w-md text-lg leading-7 text-[#F7F0DE]/58">
              Trim, frame, and export with Lumeo.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-full bg-[#F3E7C8] px-7 py-3.5 text-center text-sm font-bold text-[#111018] transition hover:bg-white"
              >
                Open Studio
              </Link>
              <a
                href="#tools"
                className="rounded-full border border-[#F3E7C8]/14 px-7 py-3.5 text-center text-sm font-bold text-[#F7F0DE]/70 transition hover:border-[#F3E7C8]/30 hover:text-white"
              >
                Explore Tools
              </a>
            </div>
          </div>

          <div id="studio" className="relative mx-auto w-full max-w-[360px]">
            <div className="relative overflow-hidden rounded-2xl border border-[#F3E7C8]/10 bg-[#101115] shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-[#F3E7C8]/10 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F3E7C8]" />
                  <span className="text-[10px] font-bold tracking-wide text-[#F7F0DE]/48">
                    9:16
                  </span>
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-[#F7F0DE]/28">
                  00:18 / 00:24
                </span>
              </div>

              <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-[#1B1C22] via-[#111219] to-[#07070A]">
                <div className="absolute inset-8 rounded-[1.5rem] border border-[#F3E7C8]/8 bg-black/18" />
                <div className="absolute bottom-8 left-8 right-8 h-2 rounded-full bg-[#F3E7C8]/12">
                  <div className="h-full w-2/3 rounded-full bg-[#F3E7C8]/60" />
                </div>
              </div>

              <div className="border-t border-[#F3E7C8]/10 bg-[#07070A] px-4 py-3.5">
                <div className="relative h-7 overflow-hidden rounded-md border border-[#F3E7C8]/10 bg-[#161620]">
                  <div className="absolute inset-y-0 left-[18%] right-[22%] bg-gradient-to-r from-[#F3E7C8]/32 to-[#F3E7C8]/12" />
                  <div className="absolute inset-y-0 left-0 w-[18%] bg-[#07070A]/75" />
                  <div className="absolute inset-y-0 right-0 w-[22%] bg-[#07070A]/75" />
                  <div className="absolute left-[18%] top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[#F3E7C8]" />
                  <div className="absolute left-[78%] top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[#F3E7C8]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="mb-12 max-w-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
            Tools
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to finish the clip.
          </h2>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-[#F3E7C8]/10 bg-[#F3E7C8]/10 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.title}
              className="bg-[#0B0C0F] p-7 transition hover:bg-[#15161B]"
            >
              <h3 className="text-lg font-bold">{tool.title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-[#F7F0DE]/50">
                {tool.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-2xl border border-[#F3E7C8]/10 bg-[#101115] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F3E7C8]/50 to-transparent" />

          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Start with one clip.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-7 text-[#F7F0DE]/50">
            Open Studio and create your next short.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-flex rounded-full bg-[#F3E7C8] px-8 py-3.5 text-sm font-bold text-[#111018] transition hover:bg-white"
          >
            Open Studio
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#F3E7C8]/10 px-6 py-8 text-center font-serif text-[11px] italic leading-5 text-[#F7F0DE]/34 sm:text-right">
        <p>© 2026 Lumeo. All rights reserved.</p>
        <p>Developed by Govardhan Gudapakam</p>
      </footer>
    </main>
  );
}
