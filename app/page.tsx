import Link from "next/link";
import AuthButton from "@/components/AuthButton";

const controls = [
  {
    title: "Trim",
    description:
      "Set precise in and out points on a real timeline, with a frame-accurate preview of exactly what you'll export.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="6" cy="6" r="2.4" />
        <circle cx="6" cy="18" r="2.4" />
        <path d="M8.4 7.2L19 17M19 7L8.4 16.8" />
      </svg>
    ),
  },
  {
    title: "Frame",
    description:
      "Switch between 9:16, 1:1, and 16:9 instantly. Choose Full Frame or Original View without leaving the canvas.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="5" y="2.5" width="14" height="19" rx="2" />
        <path d="M9 2.5v19M15 2.5v19" />
      </svg>
    ),
  },
  {
    title: "Title",
    description:
      "Drop in hooks, captions, and labels with full control over position, size, color, and weight.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 5h14M12 5v14" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Mix",
    description:
      "Balance your original audio against a music bed with two independent volume controls.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 14V9.5l11-3v9" />
        <circle cx="4.5" cy="15.5" r="2.2" />
        <circle cx="14.5" cy="15.5" r="2.2" />
      </svg>
    ),
  },
  {
    title: "Grade",
    description:
      "Brightness, contrast, saturation, and grain — six presets to start, full manual control to finish.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M12 3l2.2 5.4L20 10l-4.6 3.6L17 19l-5-3.2L7 19l1.6-5.4L4 10l5.8-1.6L12 3z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Move",
    description:
      "Speed ramp from quarter speed to double time, rotate, flip, and reposition the frame.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M5 12h11M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const workflow = [
  {
    title: "Drop in a clip",
    description:
      "Pull a video straight from your device. No account setup, no project wizard — the canvas is ready the moment the file lands.",
  },
  {
    title: "Cut it down",
    description:
      "Trim on the timeline, frame the shot, add a title, and balance the audio — all in the same view, all reflected live.",
  },
  {
    title: "Send it out",
    description:
      "Lock the format and resolution you need, and walk away with a file built for the platform it's going to.",
  },
];

const useCases = [
  "Instagram Reels",
  "YouTube Shorts",
  "Cinematic Shorts",
  "Product Clips",
  "Creator Highlights",
  "Social Media Edits",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#07070A] text-[#F7F0DE]">
      {/* ---------------------------------------------------------------- */}
      {/* NAV                                                               */}
      {/* ---------------------------------------------------------------- */}
      <nav className="relative z-50 border-b border-[#F3E7C8]/10 bg-[#07070A]/90 px-5 py-3.5 backdrop-blur-xl sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F3E7C8] text-sm font-bold text-[#111018]">
              L
            </div>
            <span className="text-base font-bold tracking-tight">Lumeo</span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-semibold text-[#F7F0DE]/55 md:flex">
            <a href="#controls" className="transition hover:text-white">
              Controls
            </a>
            <a href="#workflow" className="transition hover:text-white">
              Workflow
            </a>
            <a href="#use-cases" className="transition hover:text-white">
              Use cases
            </a>
          </div>

          <AuthButton />
        </div>
      </nav>

      {/* ---------------------------------------------------------------- */}
      {/* HERO — countdown leader settles into the real product frame      */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden px-5 pb-20 pt-16 sm:px-8 sm:pt-20 lg:px-12 lg:pt-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_35%_0%,rgba(167,139,250,0.15),transparent_58%),radial-gradient(circle_at_75%_10%,rgba(244,114,182,0.11),transparent_42%)]" />

        <div className="relative z-10 mx-auto grid max-w-7xl gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-bold text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F3E7C8]" />
              Built for vertical, square, and widescreen
            </div>

            <h1 className="max-w-xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-[4.25rem]">
              Cut your next short
              <br />
              <span className="text-[#F3E7C8]">right in the browser.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-7 text-white/55">
              Lumeo is a focused editor for short-form video — trim, frame,
              title, and grade a clip without installing anything or learning
              a timeline built for feature films.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-full bg-[#F3E7C8] px-7 py-3.5 text-center text-sm font-bold text-[#111018] transition hover:bg-white"
              >
                Open Studio
              </Link>
              <a
                href="#controls"
                className="rounded-full border border-white/12 px-7 py-3.5 text-center text-sm font-bold text-white/70 transition hover:border-white/25 hover:text-white"
              >
                See what it can do
              </a>
            </div>

            <div className="mt-12 flex items-center gap-8 border-t border-white/10 pt-7">
              <div>
                <p className="text-2xl font-bold tabular-nums">3 min</p>
                <p className="mt-0.5 text-xs font-semibold text-white/40">
                  Max clip length
                </p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-2xl font-bold tabular-nums">0</p>
                <p className="mt-0.5 text-xs font-semibold text-white/40">
                  Installs required
                </p>
              </div>
              <div className="h-8 w-px bg-white/10" />
              <div>
                <p className="text-2xl font-bold tabular-nums">3</p>
                <p className="mt-0.5 text-xs font-semibold text-white/40">
                  Frame ratios
                </p>
              </div>
            </div>
          </div>

          {/* signature: a real 9:16 frame with sprocket trim bar + tally light,
              matching the editor's actual canvas instead of a fake mockup */}
          <div className="relative mx-auto w-full max-w-[340px]">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101115] shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#FF5A36]" />
                  <span className="text-[10px] font-bold tracking-wide text-white/50">
                    9:16
                  </span>
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-white/30">
                  00:18 / 00:24
                </span>
              </div>

              <div className="relative aspect-[9/16] w-full overflow-hidden bg-gradient-to-br from-[#1C1D22] via-[#15161B] to-[#07070A]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-[Space_Grotesk,sans-serif] text-7xl font-bold text-white/[0.06]">
                    8
                  </span>
                </div>

                <div className="absolute left-1/2 top-[58%] w-[80%] -translate-x-1/2 -translate-y-1/2 text-center">
                  <p className="text-lg font-bold leading-snug text-white/90">
                    your title, exactly
                    <br />
                    where you put it
                  </p>
                </div>
              </div>

              {/* sprocket-edge trim bar — same component language as the editor */}
              <div className="border-t border-white/10 bg-[#0B0C0F] px-4 py-3.5">
                <div
                  className="relative h-7 overflow-hidden rounded-md border border-white/10 bg-[#161620]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, rgba(255,255,255,0.18) 1.2px, transparent 1.4px)",
                    backgroundSize: "12px 100%",
                    backgroundPosition: "0 2.5px, 0 calc(100% - 2.5px)",
                    backgroundRepeat: "repeat-x",
                  }}
                >
                  <div className="absolute inset-y-0 left-[18%] right-[22%] bg-gradient-to-r from-[#F3E7C8]/35 to-[#F3E7C8]/15" />
                  <div className="absolute inset-y-0 left-0 w-[18%] bg-[#0B0C0F]/75" />
                  <div className="absolute inset-y-0 right-0 w-[22%] bg-[#0B0C0F]/75" />
                  <div className="absolute left-[18%] top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[#F3E7C8] shadow-[0_0_0_3px_rgba(243,231,200,0.22)]" />
                  <div className="absolute left-[78%] top-0 h-full w-[3px] -translate-x-1/2 rounded-full bg-[#F3E7C8] shadow-[0_0_0_3px_rgba(243,231,200,0.22)]" />
                </div>
              </div>
            </div>

            <p className="mt-4 text-center text-xs font-medium text-white/30">
              This is the actual editor canvas — not a mockup.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* CONTROLS — what the editor actually does, six real tools          */}
      {/* ---------------------------------------------------------------- */}
      <section id="controls" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="mb-12 max-w-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
            Controls
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Six tools. Nothing you'll have to look up.
          </h2>
          <p className="mt-4 text-base leading-7 text-white/50">
            Every control sits in plain view on the same screen as your
            clip — there's no panel to discover and no setting buried three
            menus deep.
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {controls.map((control) => (
            <div
              key={control.title}
              className="group bg-[#0B0C0F] p-7 transition hover:bg-[#15161B]"
            >
              <span className="flex h-9 w-9 items-center justify-center text-[#FF8A6B]">
                <span className="block h-[20px] w-[20px]">{control.icon}</span>
              </span>

              <h3 className="mt-5 text-lg font-bold">{control.title}</h3>
              <p className="mt-2.5 text-sm leading-6 text-white/50">
                {control.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* WORKFLOW — a real three-step sequence, numbering earns its keep   */}
      {/* ---------------------------------------------------------------- */}
      <section id="workflow" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="rounded-2xl border border-white/10 bg-[#101115] p-8 sm:p-12 lg:p-14">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
            Workflow
          </p>
          <h2 className="max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps. In this order, every time.
          </h2>

          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3">
            {workflow.map((item, index) => (
              <div key={item.title} className="bg-[#0B0C0F] p-7">
                <span className="font-[Space_Grotesk,sans-serif] text-sm font-bold tabular-nums text-[#D8C48E]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 text-xl font-bold">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/50">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* USE CASES                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section id="use-cases" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="mb-10 max-w-xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[#D8C48E]">
            Use cases
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Made for clips that need to look clean, fast.
          </h2>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {useCases.map((useCase) => (
            <span
              key={useCase}
              className="rounded-full border border-white/10 bg-[#101115] px-5 py-2.5 text-sm font-semibold text-white/65 transition hover:border-white/20 hover:text-white"
            >
              {useCase}
            </span>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* FINAL CTA — quiet, one accent, no second gradient treatment       */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101115] p-10 text-center sm:p-16">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#F3E7C8]/50 to-transparent" />

          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Your next clip is one upload away.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-7 text-white/50">
            Open Studio, drop in a video, and start cutting. No setup
            screens between you and the timeline.
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
