// components/pdf/PdfHeroVisual.tsx
//
// Decorative filler for the /pdf-tools hero's empty right-hand gap on wide
// screens. Purely presentational (aria-hidden) -- no rotation, just gentle
// float/drift so it reads as "alive" without being distracting next to a
// tool grid people are trying to scan.

export function PdfHeroVisual() {
  return (
    <div aria-hidden="true" className="pdf-hero-visual relative hidden h-[280px] w-[300px] shrink-0 lg:block">
      <style>{`
        @keyframes pdfHeroFloatBack {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes pdfHeroFloatMid {
          0%, 100% { transform: translateY(-4px); }
          50% { transform: translateY(10px); }
        }
        @keyframes pdfHeroFloatFront {
          0%, 100% { transform: translate(0px, 4px); }
          50% { transform: translate(0px, -8px); }
        }
        @keyframes pdfHeroDrift {
          0%, 100% { transform: translate(0px, 0px); opacity: 0.55; }
          50% { transform: translate(6px, -14px); opacity: 0.9; }
        }
        @keyframes pdfHeroGlow {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
        .pdf-hero-visual .pdf-hero-doc-back { animation: pdfHeroFloatBack 7.5s ease-in-out infinite; }
        .pdf-hero-visual .pdf-hero-doc-mid { animation: pdfHeroFloatMid 6.5s ease-in-out infinite; }
        .pdf-hero-visual .pdf-hero-doc-front { animation: pdfHeroFloatFront 5.5s ease-in-out infinite; }
        .pdf-hero-visual .pdf-hero-particle-a { animation: pdfHeroDrift 8s ease-in-out infinite; }
        .pdf-hero-visual .pdf-hero-particle-b { animation: pdfHeroDrift 9.5s ease-in-out infinite reverse; }
        .pdf-hero-visual .pdf-hero-glow { animation: pdfHeroGlow 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .pdf-hero-visual * { animation: none !important; }
        }
      `}</style>

      <div className="pdf-hero-glow pointer-events-none absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(var(--atelier-sage-rgb),0.16)] blur-[60px]" />

      <div className="absolute inset-0">
        <div className="pdf-hero-doc-back absolute left-8 top-10 h-[150px] w-[110px] rounded-xl border border-[rgba(var(--atelier-sage-rgb),0.22)] bg-[linear-gradient(160deg,rgba(var(--atelier-sage-rgb),0.14),rgba(var(--atelier-sage-rgb),0.04))] shadow-[0_20px_46px_rgba(0,0,0,0.28)]" />

        <div className="pdf-hero-doc-mid absolute left-24 top-4 h-[168px] w-[124px] rounded-xl border border-[var(--border-hairline)] bg-[linear-gradient(160deg,var(--surface-raised),var(--surface-base))] shadow-[0_24px_54px_rgba(0,0,0,0.32)]">
          <div className="absolute inset-x-4 top-5 h-1.5 rounded-full bg-[rgba(var(--atelier-brass-rgb),0.4)]" />
          <div className="absolute inset-x-4 top-9 h-1 w-2/3 rounded-full bg-[var(--text-primary)]/12" />
          <div className="absolute inset-x-4 top-13 h-1 w-1/2 rounded-full bg-[var(--text-primary)]/10" />
        </div>

        <div className="pdf-hero-doc-front absolute left-14 top-24 h-[128px] w-[96px] rounded-xl border border-[rgba(var(--champagne-rgb),0.28)] bg-[linear-gradient(160deg,rgba(var(--champagne-rgb),0.16),var(--surface-raised))] shadow-[0_26px_58px_rgba(0,0,0,0.36)]">
          <div className="absolute inset-x-3 top-4 h-1.5 rounded-full bg-[var(--text-accent)]/55" />
          <div className="absolute inset-x-3 top-8 h-1 w-3/4 rounded-full bg-[var(--text-primary)]/14" />
          <div className="absolute bottom-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--emerald-600)]/85">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 12.4 3.3 3.3 7.7-8.1" />
            </svg>
          </div>
        </div>

        <span className="pdf-hero-particle-a absolute right-8 top-6 h-2 w-2 rounded-full bg-[var(--lumeo-gold)]" />
        <span className="pdf-hero-particle-b absolute bottom-10 right-16 h-1.5 w-1.5 rounded-full bg-[var(--atelier-sage-300)]" />
        <span className="pdf-hero-particle-a absolute bottom-4 left-6 h-1.5 w-1.5 rounded-full bg-[rgba(var(--champagne-rgb),0.7)]" style={{ animationDelay: "-3s" }} />
      </div>
    </div>
  );
}
