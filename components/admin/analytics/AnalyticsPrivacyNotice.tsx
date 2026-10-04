export function AnalyticsPrivacyNotice() {
  return (
    <section className="rounded-2xl border border-[#1E6B4A]/24 bg-[#1E6B4A]/10 p-4 text-sm leading-6 text-[#DDF5E9]">
      <p className="font-bold">Privacy boundary</p>
      <p className="mt-1 text-[#DDF5E9]/78">
        Verified analytics uses random first-party visitor/session tokens whose
        stored database identifiers are server-derived pseudonyms. Approximate
        city, region, and country come from Cloudflare request metadata when
        available. Lumeo does not store raw IP addresses, precise coordinates,
        documents, filenames, exact file sizes, emails, authenticated user IDs,
        or full user-agent strings in product analytics.
      </p>
    </section>
  );
}
