export function AnalyticsPrivacyNotice() {
  return (
    <section className="rounded-2xl border border-[#1E6B4A]/24 bg-[#1E6B4A]/10 p-4 text-sm leading-6 text-[#DDF5E9]">
      <p className="font-bold">Privacy-first verified analytics</p>
      <p className="mt-1 text-[#DDF5E9]/78">
        Lumeo uses first-party random visitor and 30-minute session identifiers that are HMAC-pseudonymized before storage.
        Approximate City, State/Region and Country come only from Cloudflare visitor-IP geolocation when available.
        Raw IP addresses, raw cookie tokens, GPS coordinates, browser location permission, street addresses, documents,
        filenames, exact file sizes and full user-agent strings are not stored.
      </p>
    </section>
  );
}
