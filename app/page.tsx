import Link from "next/link";
import AuthButton from "@/components/AuthButton";

const features = [
  {
    title: "Short Video Editor",
    description:
      "Create polished short videos for Reels, Shorts, social posts, product clips, and creator content.",
  },
  {
    title: "9:16 Preview",
    description:
      "Work with a vertical preview designed for mobile-first videos and short-form platforms.",
  },
  {
    title: "Trim Controls",
    description:
      "Set clean start and end points for short videos, highlights, and cinematic clips.",
  },
  {
    title: "Text Overlay",
    description:
      "Add bold titles, hooks, captions, labels, and visual text elements directly on your video.",
  },
  {
    title: "Music Workspace",
    description:
      "Attach local music or audio to shape the mood and rhythm of your short video edits.",
  },
  {
    title: "Visual Effects",
    description:
      "Adjust brightness, contrast, grayscale, blur, and visual tone for a cleaner edit.",
  },
];

const workflow = [
  {
    title: "Import your clip",
    description:
      "Start with a local video from your device and open it inside the Lumeo editor.",
  },
  {
    title: "Shape the edit",
    description:
      "Trim the video, add text, tune the look, and prepare the short-form composition.",
  },
  {
    title: "Prepare for posting",
    description:
      "Build clean short videos for mobile platforms with a focused editing workspace.",
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
    <main className="min-h-screen overflow-hidden bg-[#05030a] text-white">
      <section className="relative px-5 py-6 sm:px-8 lg:px-12">
        <div className="absolute left-1/2 top-[-140px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-purple-700/30 blur-[140px]" />
        <div className="absolute right-[-160px] top-72 h-[420px] w-[420px] rounded-full bg-amber-400/20 blur-[130px]" />
        <div className="absolute bottom-0 left-[-180px] h-[420px] w-[420px] rounded-full bg-fuchsia-600/20 blur-[140px]" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between rounded-[1.75rem] border border-white/10 bg-white/[0.06] px-4 py-4 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:px-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-400 via-fuchsia-400 to-amber-300 font-black text-black shadow-lg shadow-purple-500/20">
              L
            </div>

            <div>
              <p className="text-lg font-black leading-none tracking-tight">
                Lumeo
              </p>
              <p className="mt-1 hidden text-xs text-white/45 sm:block">
                Short video studio
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-7 text-sm font-semibold text-white/60 md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#workflow" className="transition hover:text-white">
              Workflow
            </a>
            <a href="#use-cases" className="transition hover:text-white">
              Use cases
            </a>
            <a href="#studio" className="transition hover:text-white">
              Studio
            </a>
          </div>

          <AuthButton />
        </nav>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 pb-20 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-24">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white/75 backdrop-blur-xl">
              Premium short video editing workspace
            </div>

            <h1 className="max-w-5xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Create short videos that{" "}
              <span className="bg-gradient-to-r from-purple-300 via-white to-amber-200 bg-clip-text text-transparent">
                feel premium.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/62">
              Lumeo is a browser-based editing studio for short-form videos,
              vertical edits, creator clips, social content, and cinematic
              videos up to 3 minutes.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/dashboard"
                className="rounded-full bg-gradient-to-r from-purple-400 via-fuchsia-300 to-amber-300 px-7 py-4 text-center font-black text-black shadow-xl shadow-purple-500/20 transition hover:scale-[1.02]"
              >
                Open Studio
              </Link>

              <a
                href="#features"
                className="rounded-full border border-white/15 bg-white/[0.06] px-7 py-4 text-center font-black text-white transition hover:bg-white/10"
              >
                Explore Features
              </a>
            </div>

            <div className="mt-12 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl">
                <p className="text-3xl font-black">9:16</p>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  Vertical preview
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl">
                <p className="text-3xl font-black">3 min</p>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  Short edit focus
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 backdrop-blur-xl">
                <p className="text-3xl font-black">Web</p>
                <p className="mt-1 text-sm leading-6 text-white/50">
                  Browser first
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-[3rem] bg-gradient-to-br from-purple-500/25 via-transparent to-amber-300/20 blur-2xl" />

            <div className="relative rounded-[2.25rem] border border-white/10 bg-white/[0.065] p-4 shadow-2xl shadow-black/30 backdrop-blur-2xl">
              <div className="rounded-[1.75rem] border border-white/10 bg-[#0d0a16] p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/45">Lumeo Editor</p>
                    <h2 className="text-xl font-black">Shorts Workspace</h2>
                  </div>

                  <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    Ready
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[0.65fr_1fr]">
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <div className="mb-3 h-3 w-24 rounded-full bg-white/20" />
                      <div className="h-10 rounded-xl bg-white/10" />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <div className="mb-3 h-3 w-20 rounded-full bg-white/20" />
                      <div className="h-2 rounded-full bg-cyan-300/70" />
                      <div className="mt-4 h-2 w-3/4 rounded-full bg-purple-300/60" />
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                      <div className="mb-3 h-3 w-28 rounded-full bg-white/20" />
                      <div className="grid grid-cols-3 gap-2">
                        <div className="h-12 rounded-xl bg-purple-300/20" />
                        <div className="h-12 rounded-xl bg-amber-300/20" />
                        <div className="h-12 rounded-xl bg-white/10" />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <div className="relative aspect-[9/16] w-full max-w-[250px] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/25 via-black to-amber-300/20" />

                      <div className="absolute left-1/2 top-[42%] w-[78%] -translate-x-1/2 text-center">
                        <p className="text-2xl font-black leading-tight">
                          Your short video
                        </p>
                        <p className="mt-3 text-xs leading-5 text-white/50">
                          9:16 preview, text overlays, music, trim, and clean
                          effects.
                        </p>
                      </div>

                      <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur-xl">
                        <div className="h-2 rounded-full bg-white/20">
                          <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-purple-300 to-amber-200" />
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          <div className="h-8 rounded-lg bg-white/10" />
                          <div className="h-8 rounded-lg bg-white/10" />
                          <div className="h-8 rounded-lg bg-white/10" />
                          <div className="h-8 rounded-lg bg-white/10" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center text-sm text-white/60">
                    Trim
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center text-sm text-white/60">
                    Text
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-center text-sm text-white/60">
                    Effects
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"
      >
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-purple-300">
            Features
          </p>

          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Built for short-form creators.
          </h2>

          <p className="mt-5 text-lg leading-8 text-white/55">
            A focused editor for mobile-first videos, quick creative edits, and
            polished social content.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-[2rem] border border-white/10 bg-white/[0.045] p-7 shadow-xl shadow-black/10 transition hover:-translate-y-1 hover:bg-white/[0.075]"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-400/30 to-amber-300/20 ring-1 ring-white/10">
                <div className="h-3 w-3 rounded-full bg-white transition group-hover:scale-125" />
              </div>

              <h3 className="text-2xl font-black">{feature.title}</h3>

              <p className="mt-4 leading-7 text-white/58">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="workflow"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"
      >
        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.045] p-7 shadow-2xl shadow-black/20 sm:p-10 lg:p-12">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-amber-200">
            Workflow
          </p>

          <h2 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
            From raw clip to clean short video.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {workflow.map((item, index) => (
              <div
                key={item.title}
                className="rounded-[2rem] border border-white/10 bg-black/25 p-7"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-black">
                  {index + 1}
                </div>

                <h3 className="text-2xl font-black">{item.title}</h3>

                <p className="mt-4 leading-7 text-white/55">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="use-cases"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12"
      >
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-purple-300">
            Use cases
          </p>

          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Made for short videos that need to look clean.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase) => (
            <div
              key={useCase}
              className="rounded-[1.75rem] border border-white/10 bg-white/[0.045] px-6 py-6 text-xl font-black transition hover:bg-white/[0.075]"
            >
              {useCase}
            </div>
          ))}
        </div>
      </section>

      <section
        id="studio"
        className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-12"
      >
        <div className="relative overflow-hidden rounded-[3rem] border border-white/10 bg-gradient-to-br from-purple-500/20 via-white/[0.04] to-amber-300/20 p-8 text-center shadow-2xl shadow-black/25 sm:p-14 lg:p-16">
          <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />

          <div className="relative z-10">
            <h2 className="text-4xl font-black tracking-tight sm:text-6xl">
              Start your next short video inside Lumeo.
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/65">
              Open the studio, create a project, select your video, and begin
              shaping a clean short-form edit.
            </p>

            <Link
              href="/dashboard"
              className="mt-9 inline-flex rounded-full bg-white px-8 py-4 font-black text-black transition hover:bg-amber-200"
            >
              Open Studio
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-white/45">
        © 2026 Lumeo. All rights reserved.
      </footer>
    </main>
  );
}