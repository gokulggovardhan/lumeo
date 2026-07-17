import Link from "next/link";
import { BrandLockup } from "@/components/BrandMark";
import { signInAdmin } from "@/app/admin/login/actions";

const safeMessages = {
  invalid: "Unable to sign in with those credentials.",
  "not-authorized": "This account is not authorized for Lumeo Control Center.",
  "signed-out": "You have been signed out.",
} as const;

type LoginMessageKey = keyof typeof safeMessages;

function getSafeMessage(error?: string, message?: string) {
  const key = error || message;
  return key && key in safeMessages ? safeMessages[key as LoginMessageKey] : "";
}

export const metadata = {
  title: "Lumeo Control Center",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const safeMessage = getSafeMessage(params?.error, params?.message);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)] px-5 py-10 text-[#F0EAD6]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(203,160,82,0.12),transparent_34%),radial-gradient(circle_at_82%_80%,rgba(30,107,74,0.16),transparent_32%)]" />

      <section className="relative w-full max-w-[460px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-8">
        <Link href="/" className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45">
          <BrandLockup markSize="h-10 w-10" />
        </Link>

        <div className="mt-8">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.24em] text-[#CBA052]/72">
            Administrator access
          </p>
          <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-[#F0EAD6]">
            Lumeo Control Center
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#F0EAD6]/58">
            Secure access for approved administrators. No public signup is available.
          </p>
        </div>

        {safeMessage && (
          <p
            className="mt-5 rounded-xl border border-[#CBA052]/22 bg-[#CBA052]/10 px-4 py-3 text-sm text-[#F0EAD6]/80"
            aria-live="polite"
          >
            {safeMessage}
          </p>
        )}

        <form action={signInAdmin} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-semibold text-[#F0EAD6]/78">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-2 h-12 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/28 focus:border-[#CBA052]/55 focus:ring-2 focus:ring-[#CBA052]/18"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="text-sm font-semibold text-[#F0EAD6]/78">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 h-12 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/28 focus:border-[#CBA052]/55 focus:ring-2 focus:ring-[#CBA052]/18"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1E6B4A] px-5 text-sm font-bold text-[#F0EAD6] shadow-[0_14px_34px_rgba(30,107,74,0.24)] transition hover:bg-[#257A56] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
          >
            Sign in
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#E8DFC8]/10 pt-5 text-sm">
          <p className="text-[#F0EAD6]/48">Verified administrator access only.</p>
          <Link
            href="/"
            className="font-semibold text-[#CBA052]/82 transition hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
          >
            Public workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
