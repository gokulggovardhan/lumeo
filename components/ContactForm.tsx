"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { FeedbackQueryType } from "@/lib/supabase/database.types";

type FormState = {
  type: FeedbackQueryType;
  name: string;
  email: string;
  subject: string;
  message: string;
  // Honeypot: real users never see or fill this field. Any bot that
  // populates every input on the page (a common scraping pattern) fills it,
  // and the submit handler silently rejects the request client-side.
  companyWebsite: string;
};

const emptyForm: FormState = {
  type: "Query",
  name: "",
  email: "",
  subject: "",
  message: "",
  companyWebsite: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Toast = { tone: "success" | "error"; message: string };

// Same "feedback_queries" table and /api/feedback contract as before (the
// database's type column is a strict Query/Feedback enum) -- only the
// labels shown to a visitor changed, to read naturally on a Contact page
// rather than as an internal ticket-triage category.
const TYPE_OPTIONS: { value: FeedbackQueryType; label: string }[] = [
  { value: "Query", label: "General query" },
  { value: "Feedback", label: "Feedback or suggestion" },
];

export function ContactForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    // Honeypot tripped -- a bot filled a field real users never see. Drop the
    // submission without telling the bot anything went wrong.
    if (form.companyWebsite.trim() !== "") {
      setForm(emptyForm);
      return;
    }

    const name = form.name.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    const email = form.email.trim();

    if (!name) return setError("Name is required.");
    if (!subject) return setError("Subject is required.");
    if (subject.length > 150) return setError("Subject must be 150 characters or fewer.");
    if (!message) return setError("Message is required.");
    if (message.length > 2000) return setError("Message must be 2000 characters or fewer.");
    if (email && !emailPattern.test(email)) return setError("Enter a valid email address, or leave it blank.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          name,
          email,
          subject,
          message,
          companyWebsite: form.companyWebsite,
        }),
      });
      const result = (await response.json().catch(() => null)) as { ok?: boolean } | null;

      if (!response.ok || !result?.ok) {
        setToast({ tone: "error", message: "Could not send your message. Please try again." });
        return;
      }

      setToast({ tone: "success", message: "Thanks — your message was sent." });
      setForm(emptyForm);
    } catch {
      setToast({ tone: "error", message: "Could not send your message. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-4 shadow-[inset_0_1px_0_rgba(255,253,247,0.06)] sm:p-5">
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* Honeypot: visually hidden, off the tab order, never presented to a real user. */}
        <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
          <label htmlFor="company-website">Company website</label>
          <input
            id="company-website"
            name="company-website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.companyWebsite}
            onChange={(event) => updateField("companyWebsite", event.target.value)}
          />
        </div>

        <label className="block text-sm font-semibold text-[var(--text-primary)]">
          Feedback or queries
          <select
            value={form.type}
            onChange={(event) => updateField("type", event.target.value as FeedbackQueryType)}
            className="mt-1 h-11 w-full appearance-none rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] bg-[image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] bg-[position:calc(100%-18px)_center,calc(100%-13px)_center] bg-[size:5px_5px,5px_5px] bg-no-repeat px-3 pr-9 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Name
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
            />
          </label>
          <label className="block text-sm font-semibold text-[var(--text-primary)]">
            Email <span className="font-normal text-[var(--text-subtle)]">(optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="mt-1 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
            />
          </label>
        </div>

        <label className="block text-sm font-semibold text-[var(--text-primary)]">
          Subject
          <input
            type="text"
            required
            maxLength={150}
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            className="mt-1 h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
          />
        </label>

        <label className="block text-sm font-semibold text-[var(--text-primary)]">
          Message
          <textarea
            required
            rows={3}
            maxLength={2000}
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            className="mt-1 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--border-danger)] bg-[var(--surface-danger)] px-3 py-2 text-sm font-medium text-[var(--text-danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-0.5">
          <p className="text-xs leading-4 text-[var(--text-subtle)]">
            Don&rsquo;t send confidential PDF files — describe the issue in words.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              "Send message"
            )}
          </button>
        </div>
      </form>

      {toast ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold ${
            toast.tone === "success"
              ? "border-[rgba(var(--lumeo-seal-rgb),0.4)] bg-[var(--surface-success)] text-[var(--text-success)]"
              : "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)]"
          }`}
        >
          {toast.message}
        </p>
      ) : null}
    </div>
  );
}
