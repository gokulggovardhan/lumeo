import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#CBA052]/72">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#F0EAD6] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/58">{description}</p>
      </div>
      {meta}
    </header>
  );
}
