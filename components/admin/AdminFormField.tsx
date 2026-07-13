import type { ReactNode } from "react";

export function AdminFormField({
  label,
  name,
  defaultValue,
  type = "text",
  help,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: "text" | "number" | "datetime-local" | "email" | "url";
  help?: string;
  children?: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-[#F0EAD6]">
      {label}
      {children ?? (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          className="mt-2 min-h-11 w-full rounded-xl border border-[#E8DFC8]/12 bg-[#0C1220]/66 px-3 py-2 text-sm text-[#F0EAD6] outline-none transition duration-200 placeholder:text-[#F0EAD6]/30 focus:border-[#CBA052]/60 focus:ring-2 focus:ring-[#CBA052]/15"
        />
      )}
      {help && <span className="mt-1 block text-xs font-normal text-[#F0EAD6]/45">{help}</span>}
    </label>
  );
}
