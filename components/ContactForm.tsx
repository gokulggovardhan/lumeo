"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle, Send, Sparkles, Tag, User } from "lucide-react";
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
// labels and framing shown to a visitor changed.
const TYPE_OPTIONS: { value: FeedbackQueryType; label: string; icon: typeof MessageCircle }[] = [
  { value: "Query", label: "Ask something", icon: MessageCircle },
  { value: "Feedback", label: "Share feedback", icon: Sparkles },
];

function autoGrow(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, 152)}px`;
}

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

  const fieldClass =
    "peer h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]";
  const iconClass = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-subtle)] transition-colors peer-focus:text-[var(--text-accent)]";

  return (
    <div className="rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[linear-gradient(160deg,rgba(var(--champagne-rgb),0.05),rgba(var(--lumeo-paper-rgb),0.03))] p-4 shadow-[inset_0_1px_0_rgba(255,253,247,0.06)] sm:p-5">
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

        <div role="radiogroup" aria-label="What's this about" className="grid grid-cols-2 gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-input)] p-1">
          {TYPE_OPTIONS.map((option) => {
            const selected = form.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => updateField("type", option.value)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                  selected
                    ? "bg-[rgba(var(--champagne-rgb),0.18)] text-[var(--text-primary)] shadow-[inset_0_0_0_1px_rgba(var(--champagne-rgb),0.4)]"
                    : "text-[var(--text-subtle)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <option.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <User aria-hidden="true" className={iconClass} />
            <label htmlFor="contact-name" className="sr-only">Name</label>
            <input
              id="contact-name"
              type="text"
              required
              placeholder="Your name"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="relative">
            <Mail aria-hidden="true" className={iconClass} />
            <label htmlFor="contact-email" className="sr-only">Email (optional)</label>
            <input
              id="contact-email"
              type="email"
              placeholder="Email (optional)"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="relative">
          <Tag aria-hidden="true" className={iconClass} />
          <label htmlFor="contact-subject" className="sr-only">Subject</label>
          <input
            id="contact-subject"
            type="text"
            required
            maxLength={150}
            placeholder="Subject"
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="contact-message" className="sr-only">Message</label>
          <textarea
            id="contact-message"
            required
            rows={2}
            maxLength={2000}
            placeholder="Tell us what's on your mind..."
            value={form.message}
            onChange={(event) => {
              updateField("message", event.target.value);
              autoGrow(event.target);
            }}
            className="max-h-[152px] min-h-[76px] w-full resize-none overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-subtle)] focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
          />
        </div>

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
            className="inline-flex h-11 min-w-32 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[linear-gradient(135deg,var(--emerald-500),var(--emerald-600))] px-5 text-sm font-semibold text-[var(--text-on-accent)] shadow-[0_10px_24px_rgba(var(--emerald-rgb),0.28)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" aria-hidden="true" />
                Send message
              </>
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
