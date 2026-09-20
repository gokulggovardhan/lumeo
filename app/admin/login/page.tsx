import { BrandLockup } from "@/components/BrandMark";
import { AdminLoginSubmitButton } from "@/components/admin/AdminLoginSubmitButton";
import { signInAdmin } from "@/app/admin/login/actions";

const safeMessages = {
  invalid: "Unable to sign in with those credentials.",
  "not-authorized": "This account is not authorized for Lumeo Control Center.",
  "signed-out": "You have been signed out.",
  "session-ended": "Your administrator session has ended. Sign in again to continue.",
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

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const safeMessage = getSafeMessage(params?.error, params?.message);

  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-[var(--surface-canvas)] px-5 text-[#F0EAD6]"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
        paddingRight: "max(1.25rem, env(safe-area-inset-right))",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(203,160,82,0.12),transparent_34%),radial-gradient(circle_at_82%_80%,rgba(30,107,74,0.16),transparent_32%)]" />

      <section className="relative w-full max-w-[460px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.32)] sm:p-8">
        <a href="/" className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45">
          <BrandLockup markSize="h-10 w-10" />
        </a>

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
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="mt-2 h-12 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-base text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/28 focus:border-[#CBA052]/55 focus:ring-2 focus:ring-[#CBA052]/18"
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
              className="mt-2 h-12 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-input)] px-4 text-base text-[#F0EAD6] outline-none transition placeholder:text-[#F0EAD6]/28 focus:border-[#CBA052]/55 focus:ring-2 focus:ring-[#CBA052]/18"
              placeholder="Enter your password"
            />
          </div>

          <AdminLoginSubmitButton />
        </form>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#E8DFC8]/10 pt-5 text-sm">
          <p className="text-[#F0EAD6]/48">Verified administrator access only.</p>
          <a
            href="/"
            className="font-semibold text-[#CBA052]/82 transition hover:text-[#F0EAD6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CBA052]/45"
          >
            Public workspace
          </a>
        </div>
      </section>
    </main>
  );
}
