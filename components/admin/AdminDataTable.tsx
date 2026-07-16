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
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)]">
      <table className="min-w-full divide-y divide-[var(--border-subtle)] text-left text-sm">
        <thead className="bg-[rgba(8,16,29,0.58)] text-xs uppercase tracking-[0.14em] text-[var(--lumeo-paper-400)]">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-4 py-3 font-bold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((row, index) => (
            <tr key={index} className="bg-[var(--surface-raised)] transition duration-200 hover:bg-[var(--surface-elevated)]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top text-[var(--lumeo-paper-200)]">
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
