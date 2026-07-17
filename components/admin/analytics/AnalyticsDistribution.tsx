export function AnalyticsDistribution({
  succeeded,
  failed,
}: {
  succeeded: number;
  failed: number;
}) {
  const total = succeeded + failed;
  const successPercent = total > 0 ? Math.round((succeeded / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4">
      <h3 className="text-sm font-bold text-[#F0EAD6]">Success distribution</h3>
      {total > 0 ? (
        <>
          <div
            className="mt-4 h-3 overflow-hidden rounded-full bg-[#F0A8A8]/16"
            aria-label={`${successPercent}% successful processing outcomes`}
          >
            <div className="h-full rounded-full bg-[#1E6B4A]" style={{ width: `${successPercent}%` }} />
          </div>
          <p className="mt-3 text-sm text-[#F0EAD6]/58">
            {succeeded} succeeded, {failed} failed.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-[#F0EAD6]/48">No processing outcomes yet.</p>
      )}
    </div>
  );
}
