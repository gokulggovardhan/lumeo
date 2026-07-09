export function PdfTrustRail({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#C9A84C]/18 bg-[#0A101C]/82 px-4 py-3 shadow-[inset_0_1px_0_rgba(240,234,214,0.06)]">
      <p className="text-xs font-semibold text-[#F0EAD6]/72">
        Private by design · Browser-first where possible · Clear file handling
      </p>
      {!compact ? (
        <p className="mt-1 text-xs leading-5 text-[#F0EAD6]/42">
          Future engines will keep the same calm workflow: honest tool states,
          no unnecessary sign-in, and clear cleanup rules.
        </p>
      ) : null}
    </div>
  );
}
