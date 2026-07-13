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
    <div className="overflow-x-auto rounded-[1rem] border border-[#E8DFC8]/8">
      <table className="min-w-full divide-y divide-[#E8DFC8]/8 text-left text-sm">
        <thead className="bg-[#0C1220]/52 text-xs uppercase tracking-[0.14em] text-[#E8DFC8]/48">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-4 py-3 font-bold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8DFC8]/8">
          {rows.map((row, index) => (
            <tr key={index} className="bg-[#111A2B] transition duration-200 hover:bg-[#142034]">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top text-[#F0EAD6]/72">
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
