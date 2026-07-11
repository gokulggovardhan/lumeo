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
    <main className="min-h-screen bg-[#0C1220] text-[#F0EAD6]">
      <PublicNav />
      <article className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8 sm:py-16">
        <header className="mx-auto max-w-[820px]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#C9A84C]">
            {eyebrow}
          </p>
          <h1 className="mt-4 font-serif text-4xl leading-[1.02] tracking-[-0.02em] text-[#F0EAD6] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-5 text-base leading-8 text-[#F0EAD6]/62 sm:text-lg">
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
                      ? "inline-flex rounded-full bg-[#1E6B4A] px-5 py-3 text-sm font-bold text-[#F0EAD6] transition hover:-translate-y-0.5 hover:bg-[#257B56] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
                      : "inline-flex rounded-full border border-[#E8DFC8]/16 px-5 py-3 text-sm font-bold text-[#F0EAD6]/68 transition hover:border-[#C9A84C]/36 hover:text-[#F0EAD6] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/45"
                  }
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : null}
        </header>
        <div className="mx-auto mt-10 max-w-[820px] space-y-5 sm:mt-12">
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
      className="rounded-xl border border-[#E8DFC8]/14 bg-[#1A2840]/72 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-7"
    >
      {eyebrow ? (
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#C9A84C]">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="font-serif text-2xl leading-tight text-[#F0EAD6] sm:text-3xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-[#F0EAD6]/62 sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export function InfoCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#C9A84C]/24 bg-[#C9A84C]/10 px-4 py-3 text-sm font-medium leading-7 text-[#E8DFC8]/78">
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
          className="grid gap-1 rounded-lg border border-[#E8DFC8]/10 bg-[#0C1220]/42 p-4 sm:grid-cols-[180px_1fr] sm:gap-4"
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
