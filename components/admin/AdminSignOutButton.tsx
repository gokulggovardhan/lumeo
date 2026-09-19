"use client";

export const ADMIN_SIGNED_OUT_MARKER = "lumeo:admin:signed-out";

export function AdminSignOutButton() {
  function markSignedOut() {
    try {
      window.sessionStorage.setItem(ADMIN_SIGNED_OUT_MARKER, "1");
    } catch {
      // Storage can be unavailable in hardened browser modes. The server
      // logout and history/session probes remain authoritative.
    }
  }

  return (
    <form action="/admin/logout" method="post" onSubmit={markSignedOut}>
      <button
        type="submit"
        className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full border border-[#E8DFC8]/12 px-4 text-sm font-semibold text-[#F0EAD6]/72 transition hover:border-[#CBA052]/35 hover:bg-[#CBA052]/10 hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
      >
        Sign out
      </button>
    </form>
  );
}
