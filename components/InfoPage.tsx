import Link from "next/link";
import type { ReactNode } from "react";
import PublicFooter from "@/components/PublicFooter";
import { PublicNav } from "@/components/PublicPdfChrome";

type InfoLink = {
  label: string;
  href: string;
};

type InfoSection = {
  id?: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
};

export function InfoStructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function InfoPageShell({
  eyebrow,
  title,
  description,
  lastUpdated,
  children,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated?: string;
  children: ReactNode;
  actions?: InfoLink[];
}) {
  return (
    <main id="main-content" className="aura-info-page min-h-screen bg-[var(--surface-canvas)] text-[var(--lumeo-paper-100)]">
      <PublicNav />
      <article className="mx-auto max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14">
        <header className="mx-auto max-w-[820px]">
          <p className="aura-text-label text-[var(--lumeo-gold-300)]">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-serif text-[var(--text-display-md)] leading-[var(--leading-display)] tracking-[var(--tracking-display)] text-[var(--lumeo-paper-50)]">
            {title}
          </h1>
          <p className="mt-5 text-base leading-8 text-[var(--lumeo-paper-400)] sm:text-lg">
            {description}
          </p>
          {lastUpdated ? (
            <p className="mt-4 text-sm font-medium text-[#F0EAD6]/42">
              Last updated: {lastUpdated}
            </p>
          ) : null}
          {actions?.length ? (
            <div className="mt-7 flex flex-wrap gap-3">
              {actions.map((action, index) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className={
                    index === 0
                      ? "inline-flex rounded-full bg-[var(--lumeo-seal-500)] px-5 py-3 text-sm font-bold text-[var(--lumeo-paper-50)] transition hover:-translate-y-0.5 hover:bg-[var(--lumeo-seal-400)] focus:outline-none focus:ring-4 focus:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
                      : "inline-flex rounded-full border border-[var(--border-subtle)] px-5 py-3 text-sm font-bold text-[var(--lumeo-paper-200)] transition hover:border-[var(--border-premium)] hover:text-[var(--lumeo-paper-50)] focus:outline-none focus:ring-4 focus:ring-[rgba(var(--lumeo-aura-rgb),0.2)]"
                  }
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>
        <div className="mx-auto mt-10 max-w-[820px] space-y-9 sm:mt-12">
          {children}
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}

export function InfoPageSection({ id, eyebrow, title, children }: InfoSection) {
  return (
    <section
      id={id}
      className="rounded-[var(--radius-2xl)] border border-[var(--border-subtle)] bg-[rgba(var(--lumeo-paper-rgb),0.045)] p-6 shadow-[var(--shadow-sm)]"
    >
      {eyebrow ? (
        <p className="aura-text-label mb-3 text-[var(--lumeo-gold-300)]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-serif text-2xl leading-tight text-[var(--lumeo-paper-50)] sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--lumeo-paper-400)] sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export function InfoCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border-premium)] bg-[rgba(var(--lumeo-gold-rgb),0.1)] px-4 py-3 text-sm font-medium leading-7 text-[var(--lumeo-paper-200)]">
      {children}
    </div>
  );
}

export function InfoDefinitionList({
  items,
}: {
  items: Array<{ term: string; description: string }>;
}) {
  return (
    <dl className="grid gap-3">
      {items.map((item) => (
        <div
          key={item.term}
          className="grid gap-1 border-t border-[#E8DFC8]/10 py-3 sm:grid-cols-[180px_1fr] sm:gap-4"
        >
          <dt className="text-xs font-bold uppercase tracking-[0.16em] text-[#C9A84C]">
            {item.term}
          </dt>
          <dd className="text-sm leading-6 text-[#F0EAD6]/62">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function InfoList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C9A84C]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoInlineLinks({ links }: { links: InfoLink[] }) {
  return (
    <nav aria-label="Related information" className="flex flex-wrap gap-3">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="rounded-full border border-[#E8DFC8]/14 px-4 py-2 text-sm font-bold text-[#F0EAD6]/62 transition hover:border-[#C9A84C]/34 hover:text-[#F0EAD6] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
