import type { ReactNode } from "react";

export function AdminSectionCard({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[1.35rem] border border-[#E8DFC8]/10 bg-[#111A2B] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.18)] transition duration-200 ${className}`}
    >
      {(title || description || action) && (
        <div className="mb-5 flex flex-col gap-3 border-b border-[#E8DFC8]/8 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {title && <h2 className="text-base font-semibold text-[#F0EAD6]">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-6 text-[#F0EAD6]/56">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
