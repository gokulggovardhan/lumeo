"use client";

import { useState } from "react";

export const ADMIN_SIGNED_OUT_MARKER = "lumeo:admin:signed-out";

export function AdminSignOutButton() {
  const [pending, setPending] = useState(false);

  function markSignedOut() {
    try {
      window.sessionStorage.setItem(ADMIN_SIGNED_OUT_MARKER, "1");
    } catch {
      // Storage can be unavailable in hardened browser modes. The server
      // logout and history/session probes remain authoritative.
    }
  }

  async function signOut() {
    if (pending) return;
    setPending(true);
    markSignedOut();

    try {
      const response = await fetch("/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "follow",
        headers: {
          Accept: "text/html",
        },
      });

      if (!response.ok) {
        throw new Error("Admin logout request failed.");
      }

      // Use a hard navigation so Safari cannot retain a protected RSC tree
      // after the server has cleared the Supabase session cookies.
      window.location.replace("/admin/login?message=signed-out");
    } catch {
      // Do not pretend sign-out succeeded if the authoritative POST failed.
      // Leave the current page in place so the operator can retry.
      setPending(false);
      try {
        window.sessionStorage.removeItem(ADMIN_SIGNED_OUT_MARKER);
      } catch {
        // Storage is defense in depth only.
      }
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => void signOut()}
      className="inline-flex min-h-11 touch-manipulation items-center justify-center rounded-full border border-[#E8DFC8]/12 px-4 text-sm font-semibold text-[#F0EAD6]/72 transition hover:border-[#CBA052]/35 hover:bg-[#CBA052]/10 hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45 disabled:cursor-wait disabled:opacity-45"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
