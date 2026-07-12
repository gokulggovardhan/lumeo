const statusCards = [
  {
    label: "Supabase connection",
    value: "Configured",
    detail: "Browser and server clients are available.",
  },
  {
    label: "Authentication",
    value: "Verified",
    detail: "Identity is checked with verified claims.",
  },
  {
    label: "Foundation",
    value: "Ready",
    detail: "Admin membership authorization is active.",
  },
];

const nextItems = [
  "Analytics - Coming next",
  "PDF Tools - Coming next",
  "System - Coming next",
];

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="max-w-3xl">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#CBA052]/72">
          Overview
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#F0EAD6] sm:text-4xl">
          Lumeo Control Center
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/58">
          A quiet administrative foundation for Lumeo PDF Workspace. This phase
          verifies administrator identity and membership only.
        </p>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {statusCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[#E8DFC8]/10 bg-[#0C1220]/45 p-5"
          >
            <p className="text-xs font-semibold text-[#F0EAD6]/50">{card.label}</p>
            <p className="mt-2 text-xl font-semibold text-[#F0EAD6]">{card.value}</p>
            <p className="mt-2 text-sm leading-6 text-[#F0EAD6]/52">{card.detail}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#E8DFC8]/10 bg-[#0C1220]/45 p-5">
        <p className="text-sm font-semibold text-[#F0EAD6]">Navigation foundation</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-[#1E6B4A]/45 bg-[#1E6B4A]/14 px-4 py-3 text-sm font-semibold text-[#F0EAD6]">
            Overview
          </div>
          {nextItems.map((item) => (
            <div
              key={item}
              className="rounded-xl border border-[#E8DFC8]/8 bg-[#F0EAD6]/[0.025] px-4 py-3 text-sm font-semibold text-[#F0EAD6]/56"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
