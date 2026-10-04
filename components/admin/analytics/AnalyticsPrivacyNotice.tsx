export function AnalyticsPrivacyNotice() {
  return (
    <section className="rounded-2xl border border-[#1E6B4A]/24 bg-[#1E6B4A]/10 p-4 text-sm leading-6 text-[#DDF5E9]">
      <p className="font-bold">Privacy boundary</p>
      <p className="mt-1 text-[#DDF5E9]/78">
        Verified audience analytics uses first-party pseudonymous visitor/session identifiers and Cloudflare&apos;s approximate public-IP city/region/country when available. No GPS permission, exact coordinates, street address, raw IP storage, document content, filename, exact file size, email, account ID, or invasive fingerprint is collected.
      </p>
    </section>
  );
}
