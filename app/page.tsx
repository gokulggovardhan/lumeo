import AuthButton from "@/components/AuthButton";
const features = [
  {
    title: "Video Editor",
    description:
      "Create clean, polished videos with a modern editing workspace built for creators, brands, and educators.",
  },
  {
    title: "Shorts Creator",
    description:
      "Turn long content into short-form videos for YouTube Shorts, Instagram Reels, and social platforms.",
  },
  {
    title: "Podcast Studio",
    description:
      "Prepare podcast clips, highlight moments, titles, captions, and publishing-ready content.",
  },
  {
    title: "Developer Studio",
    description:
      "Create tutorials, walkthroughs, screen-recording based lessons, and product explainers.",
  },
  {
    title: "Learning Studio",
    description:
      "Build educational videos, course lessons, visual explanations, and structured learning content.",
  },
  {
    title: "Premium Interface",
    description:
      "A clean, focused, premium workspace designed to make creative work feel faster and smoother.",
  },
];

const workflow = [
  "Bring your content in",
  "Shape your story",
  "Prepare for platforms",
];

const creators = [
  "Video Creators",
  "Podcasters",
  "Educators",
  "Developers",
  "Social Teams",
  "Businesses",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#05030a] text-white">
      <section className="relative px-6 py-8 sm:px-10 lg:px-16">
        <div className="absolute left-1/2 top-0 -z-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-purple-700/30 blur-[130px]" />
        <div className="absolute right-0 top-40 -z-0 h-[380px] w-[380px] rounded-full bg-amber-500/20 blur-[120px]" />

        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-amber-300 font-bold text-black">
              L
            </div>
            <span className="text-xl font-bold tracking-tight">Lumeo</span>
          </div>

          <div className="hidden items-center gap-8 text-sm text-white/70 md:flex">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#workflow" className="hover:text-white">
              Workflow
            </a>
            <a href="#creators" className="hover:text-white">
              Creators
            </a>
            <a href="#studio" className="hover:text-white">
              Studio
            </a>
          </div>

         <AuthButton />
        </nav>

        <div className="relative z-10 mx-auto grid max-w-7xl gap-14 pb-20 pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="mb-6 inline-flex rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75">
              Premium creator workspace
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl">
              Edit Smarter.{" "}
              <span className="bg-gradient-to-r from-purple-300 via-white to-amber-200 bg-clip-text text-transparent">
                Create Faster.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              A premium online creative studio for video editing, short-form
              content, podcasts, developer tutorials, learning experiences, and
              brand-ready publishing workflows.
            </p>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="#features"
                className="rounded-full bg-gradient-to-r from-purple-500 to-amber-300 px-7 py-4 text-center font-bold text-black transition hover:scale-[1.02]"
              >
                Explore Lumeo
              </a>
              <a
                href="#studio"
                className="rounded-full border border-white/15 bg-white/5 px-7 py-4 text-center font-bold text-white transition hover:bg-white/10"
              >
                View Studio
              </a>
            </div>

            <div className="mt-12 grid max-w-xl grid-cols-3 gap-4">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-3xl font-black">4+</p>
                <p className="mt-1 text-sm text-white/55">Creator workflows</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-3xl font-black">Web</p>
                <p className="mt-1 text-sm text-white/55">Browser first</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                <p className="text-3xl font-black">Pro</p>
                <p className="mt-1 text-sm text-white/55">Clean interface</p>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl">
            <div className="rounded-[1.5rem] bg-[#0d0a16] p-5">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/45">Lumeo Studio</p>
                  <h2 className="text-xl font-bold">Creator Workspace</h2>
                </div>
                <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm text-emerald-300">
                  Ready
                </div>
              </div>

              <div className="grid gap-4">
                <div className="h-44 rounded-3xl bg-gradient-to-br from-purple-500/40 via-fuchsia-500/20 to-amber-300/30 p-5">
                  <div className="h-full rounded-2xl border border-white/15 bg-black/25" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="h-24 rounded-2xl bg-white/10" />
                  <div className="h-24 rounded-2xl bg-white/10" />
                  <div className="h-24 rounded-2xl bg-white/10" />
                </div>

                <div className="space-y-3 rounded-3xl border border-white/10 bg-black/25 p-4">
                  <div className="h-3 w-3/4 rounded-full bg-purple-300/60" />
                  <div className="h-3 w-1/2 rounded-full bg-amber-200/60" />
                  <div className="h-3 w-5/6 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16"
      >
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
            Features
          </p>
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            Built for modern creators.
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 transition hover:-translate-y-1 hover:bg-white/[0.07]"
            >
              <h3 className="text-2xl font-bold">{feature.title}</h3>
              <p className="mt-4 leading-7 text-white/60">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="workflow"
        className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16"
      >
        <div className="rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 sm:p-12">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-amber-200">
            Workflow
          </p>
          <h2 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
            Simple flow from raw content to polished output.
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {workflow.map((item, index) => (
              <div
                key={item}
                className="rounded-3xl border border-white/10 bg-black/25 p-7"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-black">
                  {index + 1}
                </div>
                <h3 className="text-2xl font-bold">{item}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="creators"
        className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-16"
      >
        <div className="mb-12 max-w-3xl">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-purple-300">
            For creators
          </p>
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
            One studio for many creative workflows.
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((creator) => (
            <div
              key={creator}
              className="rounded-3xl border border-white/10 bg-white/[0.04] px-6 py-6 text-xl font-bold"
            >
              {creator}
            </div>
          ))}
        </div>
      </section>

      <section
        id="studio"
        className="mx-auto max-w-7xl px-6 py-24 sm:px-10 lg:px-16"
      >
        <div className="rounded-[3rem] border border-white/10 bg-gradient-to-br from-purple-500/20 via-white/[0.04] to-amber-300/20 p-10 text-center sm:p-16">
          <h2 className="text-4xl font-black tracking-tight sm:text-6xl">
            A premium studio for modern creators.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/65">
            Designed to make creative work feel faster, cleaner, and more
            enjoyable.
          </p>
          <a
            href="#features"
            className="mt-9 inline-flex rounded-full bg-white px-8 py-4 font-bold text-black transition hover:bg-amber-200"
          >
            Explore Features
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-white/45">
        © 2026 Lumeo. All rights reserved.
      </footer>
    </main>
  );
}