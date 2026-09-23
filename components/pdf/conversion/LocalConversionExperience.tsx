"use client";

import { Check, ShieldCheck } from "lucide-react";

import type { ConversionPhase } from "@/lib/conversion/types";

type ConversionKind = "word-to-pdf" | "pdf-to-word";

const WORD_STAGES: Array<{ phase: ConversionPhase; label: string }> = [
  { phase: "preparing", label: "Preparing document" },
  { phase: "loading-engine", label: "Loading conversion engine" },
  { phase: "converting", label: "Processing document" },
  { phase: "generating", label: "Generating PDF" },
  { phase: "validating", label: "Validating output" },
  { phase: "finalizing", label: "Finalizing file" },
];

const PDF_STAGES: Array<{ phase: ConversionPhase; label: string }> = [
  { phase: "preparing", label: "Preparing document" },
  { phase: "loading-engine", label: "Loading PDF engine" },
  { phase: "converting", label: "Reconstructing document" },
  { phase: "generating", label: "Generating Word document" },
  { phase: "validating", label: "Validating output" },
  { phase: "finalizing", label: "Finalizing file" },
];

export function ConversionStageIndicator({
  kind,
  phase,
  detail,
}: {
  kind: ConversionKind;
  phase: ConversionPhase;
  detail: string;
}) {
  const stages = kind === "word-to-pdf" ? WORD_STAGES : PDF_STAGES;
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.phase === phase),
  );

  return (
    <div
      className="mt-3 rounded-xl border border-[var(--text-primary)]/10 bg-[var(--atelier-surface-2)]/62 p-4"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="text-sm font-bold text-[var(--text-primary)]">{detail}</p>
      <ol
        aria-label="Conversion stages"
        className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-6"
      >
        {stages.map((stage, index) => {
          const completed = index < currentIndex;
          const current = index === currentIndex;

          return (
            <li
              key={stage.phase}
              aria-current={current ? "step" : undefined}
              className={[
                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-[11px] font-bold",
                current
                  ? "bg-[rgb(var(--champagne-rgb)/0.12)] text-[var(--text-primary)]"
                  : completed
                    ? "text-[var(--text-success)]"
                    : "text-[var(--text-subtle)]",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                  current
                    ? "border-[var(--text-accent)] bg-[rgb(var(--champagne-rgb)/0.12)]"
                    : completed
                      ? "border-[var(--text-success)]/40"
                      : "border-[var(--text-primary)]/15",
                ].join(" ")}
              >
                {completed ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 leading-4">{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function LocalConversionPrivacyNote() {
  return (
    <div className="mx-auto flex w-fit max-w-[620px] items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-raised)] px-4 py-2 text-center text-xs font-extrabold text-[var(--text-muted)]">
      <ShieldCheck
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-[var(--text-premium)]"
      />
      <span>
        Processed locally in your browser. Your document is not uploaded for conversion.
      </span>
    </div>
  );
}
