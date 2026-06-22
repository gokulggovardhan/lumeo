import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import SeoStructuredData from "@/components/SeoStructuredData";

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
      <SeoStructuredData />

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

      <section className="relative overflow-hidden px-5 pb-14 pt-14 sm:px-8 sm:pt-18 lg:px-12 lg:pb-16 lg:pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_6%,rgba(243,231,200,0.12),transparent_32%),radial-gradient(circle_at_74%_9%,rgba(167,139,250,0.14),transparent_38%),linear-gradient(rgba(243,231,200,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(243,231,200,0.02)_1px,transparent_1px)] bg-[size:auto,auto,44px_44px,44px_44px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#07070A] via-transparent to-transparent" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.98fr_1.02fr] lg:items-center">
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
              Lumeo is an online creative studio for video creators to edit,
              reframe, title, and export polished clips.
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

            <div className="mt-8 flex flex-wrap gap-2.5">
              {["Trim clips", "Frame for socials", "Export clean MP4"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-[#F3E7C8]/10 bg-white/[0.035] px-4 py-2 text-xs font-bold text-[#F7F0DE]/54 backdrop-blur"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>

          <div id="studio" className="relative mx-auto w-full max-w-[560px]">
            <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_50%_20%,rgba(243,231,200,0.13),transparent_48%),radial-gradient(circle_at_78%_70%,rgba(167,139,250,0.14),transparent_42%)] blur-xl" />

            <div className="relative rounded-[2rem] border border-[#F3E7C8]/10 bg-[#101115]/88 p-4 shadow-2xl shadow-black/45 backdrop-blur-2xl sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#F3E7C8]" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F7F0DE]/42">
                    Studio
                  </span>
                </div>
                <span className="rounded-full border border-[#F3E7C8]/10 bg-[#F3E7C8]/8 px-3 py-1 text-[10px] font-black text-[#F3E7C8]/78">
                  Ready to export
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px]">
                <div className="relative mx-auto aspect-[9/16] w-full max-w-[290px] overflow-hidden rounded-[1.5rem] border border-[#F3E7C8]/10 bg-[#07070A] shadow-2xl shadow-black/35">
                  <div className="flex items-center justify-between border-b border-[#F3E7C8]/10 px-3 py-2">
                    <span className="rounded-full bg-[#F3E7C8]/10 px-2.5 py-1 text-[10px] font-black text-[#F3E7C8]/78">
                      9:16
                    </span>
                    <span className="rounded-full bg-white/[0.055] px-2.5 py-1 text-[10px] font-black text-[#F7F0DE]/48">
                      720p
                    </span>
                  </div>

                  <div className="relative h-[calc(100%-2.3rem)] overflow-hidden bg-[radial-gradient(circle_at_42%_28%,rgba(243,231,200,0.24),transparent_18%),radial-gradient(circle_at_58%_58%,rgba(167,139,250,0.22),transparent_24%),linear-gradient(145deg,#242633,#11131c_46%,#07070A)]">
                    <div className="absolute inset-5 rounded-[1.25rem] border border-white/8 bg-black/16" />
                    <div className="absolute left-5 top-5 h-16 w-16 rounded-full bg-[#F3E7C8]/8 blur-xl" />
                    <div className="absolute bottom-5 left-5 right-5">
                      <div className="mb-2 flex items-center gap-1.5">
                        <span className="h-1.5 w-8 rounded-full bg-[#F3E7C8]/40" />
                        <span className="h-1.5 w-4 rounded-full bg-white/18" />
                      </div>
                      <div className="h-1.5 rounded-full bg-black/35">
                        <div className="h-full w-[62%] rounded-full bg-[#F3E7C8]/70" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3">
                  {["Trim", "Frame", "Export"].map((item, index) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-[#F3E7C8]/10 bg-white/[0.045] p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-xs font-black text-[#F7F0DE]/72">
                          {item}
                        </span>
                        <span className="h-1.5 w-1.5 rounded-full bg-[#F3E7C8]/70" />
                      </div>
                      <div className="space-y-1.5">
                        <div
                          className="h-1.5 rounded-full bg-[#F3E7C8]/18"
                          style={{ width: `${74 - index * 12}%` }}
                        />
                        <div
                          className="h-1.5 rounded-full bg-white/10"
                          style={{ width: `${44 + index * 10}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-[#F3E7C8]/10 bg-[#07070A]/88 p-3">
                <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.18em] text-[#F7F0DE]/32">
                  <span>Timeline</span>
                  <span>00:24</span>
                </div>
                <div className="grid grid-cols-[0.55fr_1fr_0.7fr] gap-1.5">
                  <div className="h-8 rounded-md bg-[#F3E7C8]/12" />
                  <div className="h-8 rounded-md bg-[#F3E7C8]/28" />
                  <div className="h-8 rounded-md bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="tools" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
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

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.86fr_1.14fr] lg:items-start">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
              Creator Workflow
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for focused creators.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#F7F0DE]/52">
              Lumeo keeps the editing experience clean, focused, and
              export-ready so creators can move from raw clip to polished short
              without unnecessary clutter.
            </p>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-[#F3E7C8]/10 bg-[#F3E7C8]/10 md:grid-cols-3">
            {[
              {
                title: "Short-form first",
                description:
                  "Compose clips for vertical, square, and widescreen outputs.",
              },
              {
                title: "Studio calm",
                description:
                  "A clean workspace for trimming, framing, titles, sound, and export.",
              },
              {
                title: "Export ready",
                description:
                  "Prepare polished MP4 clips for social posts and creator workflows.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-[#0B0C0F] p-7">
                <span className="mb-6 block h-1 w-10 rounded-full bg-[#F3E7C8]/70" />
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#F7F0DE]/50">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
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
