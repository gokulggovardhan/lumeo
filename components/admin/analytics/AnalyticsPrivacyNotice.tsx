export function AnalyticsPrivacyNotice() {
  return (
    <section className="rounded-2xl border border-[#1E6B4A]/24 bg-[#1E6B4A]/10 p-4 text-sm leading-6 text-[#DDF5E9]">
      <p className="font-bold">Privacy boundary</p>
      <p className="mt-1 text-[#DDF5E9]/78">
        Lumeo analytics uses temporary session IDs, coarse file-size buckets, and coarse device labels. It does not collect documents,
        filenames, exact file sizes, raw IP addresses, emails, authenticated user IDs, or full user-agent strings.
      </p>
    </section>
  );
}
