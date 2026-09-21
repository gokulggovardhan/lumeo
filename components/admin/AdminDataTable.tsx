import type { ReactNode } from "react";

export function AdminDataTable({
  columns,
  rows,
  empty,
}: {
  columns: string[];
  rows: ReactNode[][];
  empty?: ReactNode;
}) {
  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)]">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="bg-[rgba(var(--lumeo-paper-rgb),0.028)]">
            {columns.map((column) => (
              <th
                key={column}
                scope="col"
                className="border-b border-[var(--border-hairline)] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-subtle)]"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="transition hover:bg-[rgba(var(--lumeo-paper-rgb),0.022)]"
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-[var(--border-hairline)] px-4 py-3.5 align-top text-[var(--text-secondary)] last:border-b-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
