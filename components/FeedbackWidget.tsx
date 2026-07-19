"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquarePlus, X } from "lucide-react";
import type { FeedbackQueryType } from "@/lib/supabase/database.types";

type FormState = {
  type: FeedbackQueryType;
  name: string;
  email: string;
  phone: string;
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
  phone: "",
  subject: "",
  message: "",
  companyWebsite: "",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[\d\s().-]{7,20}$/;

type Toast = { tone: "success" | "error"; message: string };

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function closeModal() {
    setOpen(false);
    setForm(emptyForm);
    setError("");
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    // Honeypot tripped -- a bot filled a field real users never see. Drop the
    // submission without telling the bot anything went wrong.
    if (form.companyWebsite.trim() !== "") {
      closeModal();
      return;
    }

    const name = form.name.trim();
    const subject = form.subject.trim();
    const message = form.message.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!name) return setError("Name is required.");
    if (!subject) return setError("Subject is required.");
    if (subject.length > 150) return setError("Subject must be 150 characters or fewer.");
    if (!message) return setError("Message is required.");
    if (message.length > 2000) return setError("Message must be 2000 characters or fewer.");
    if (email && !emailPattern.test(email)) return setError("Enter a valid email address, or leave it blank.");
    if (phone && !phonePattern.test(phone)) return setError("Enter a valid phone number, or leave it blank.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          name,
          email,
          phone,
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
      closeModal();
    } catch {
      setToast({ tone: "error", message: "Could not send your message. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--emerald-600)] text-[var(--text-on-accent)] shadow-[var(--shadow-lg)] transition duration-200 hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--lumeo-aura-rgb),0.3)] active:scale-95 sm:bottom-6 sm:right-6"
      >
        <MessageSquarePlus className="h-6 w-6" aria-hidden="true" />
        <span className="sr-only">Send feedback or a query</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-widget-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            ref={dialogRef}
            className="aura-drawer-enter w-full max-w-lg rounded-t-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[var(--surface-base)] p-6 shadow-[var(--shadow-xl)] sm:rounded-[var(--radius-2xl)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-widget-title" className="font-serif text-xl font-semibold text-[var(--text-primary)]">
                  Feedback &amp; Query
                </h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Tell us what&apos;s working, what isn&apos;t, or ask us anything.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:border-[var(--border-premium)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4">
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
                Type
                <select
                  ref={firstFieldRef}
                  required
                  value={form.type}
                  onChange={(event) =>
                    // Switching type starts the rest of the form fresh -- a
                    // half-filled Feedback shouldn't leak into a Query.
                    setForm({ ...emptyForm, type: event.target.value as FeedbackQueryType })
                  }
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
                >
                  <option value="Query">Query</option>
                  <option value="Feedback">Feedback</option>
                </select>
              </label>

              <label className="block text-sm font-semibold text-[var(--text-primary)]">
                Name
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-subtle)] focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-[var(--text-primary)]">
                  Email <span className="font-normal text-[var(--text-subtle)]">(optional)</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField("email", event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
                  />
                </label>
                <label className="block text-sm font-semibold text-[var(--text-primary)]">
                  Phone <span className="font-normal text-[var(--text-subtle)]">(optional)</span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
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
                  className="mt-1.5 min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
                />
                <span className="mt-1 block text-right text-xs text-[var(--text-subtle)]">{form.subject.length}/150</span>
              </label>

              <label className="block text-sm font-semibold text-[var(--text-primary)]">
                Message
                <textarea
                  required
                  rows={4}
                  maxLength={2000}
                  value={form.message}
                  onChange={(event) => updateField("message", event.target.value)}
                  className="mt-1.5 w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:ring-4 focus:ring-[rgba(var(--champagne-rgb),0.16)]"
                />
                <span className="mt-1 block text-right text-xs text-[var(--text-subtle)]">{form.message.length}/2000</span>
              </label>

              {error ? (
                <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--border-danger)] bg-[var(--surface-danger)] px-3 py-2 text-sm font-medium text-[var(--text-danger)]">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-5 text-sm font-semibold text-[var(--text-secondary)] transition hover:border-[var(--border-premium)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--emerald-600)] px-5 text-sm font-semibold text-[var(--text-on-accent)] transition hover:-translate-y-0.5 hover:bg-[var(--emerald-500)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Sending...
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 right-5 z-50 max-w-xs rounded-[var(--radius-lg)] border px-4 py-3 text-sm font-semibold shadow-[var(--shadow-lg)] sm:bottom-6 sm:right-24 ${
            toast.tone === "success"
              ? "border-[rgba(var(--lumeo-seal-rgb),0.4)] bg-[var(--surface-success)] text-[var(--text-success)]"
              : "border-[var(--border-danger)] bg-[var(--surface-danger)] text-[var(--text-danger)]"
          }`}
        >
          {toast.message}
        </div>
      ) : null}
    </>
  );
}
