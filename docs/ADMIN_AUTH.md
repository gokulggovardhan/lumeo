# Lumeo Control Center Admin Authentication

Lumeo Control Center uses Supabase Auth for private administrator access while
the public PDF tools remain separate and browser-local.

## Architecture

- Supabase Auth provides email/password administrator sign-in.
- `public.admin_members` stores active memberships and roles.
- `lib/admin/auth.ts` verifies identity with `supabase.auth.getClaims()` and
  checks active membership server-side.
- `/admin/login` is public, outside the protected route group, with no signup.
- `app/admin/(protected)/layout.tsx` calls `requireAdmin()` before protected
  content renders.
- Login authorizes with the same Supabase server client that performed
  `signInWithPassword()`, avoiding a cookie-propagation race between clients.
- `proxy.ts` refreshes SSR auth cookies and preserves Supabase session/cache
  headers. It is a session-refresh boundary, not the authorization layer.
- `/admin/logout` is POST-only and signs out only the current session with
  `scope: "local"`.
- `/admin/session` is a private, no-store server probe used only to revalidate
  authorization after browser history/BFCache restoration.
- All `/admin/:path*` responses are private and non-cacheable.

## Route Structure

```text
app/admin/login/page.tsx
app/admin/login/actions.ts
app/admin/logout/route.ts
app/admin/session/route.ts
app/admin/(protected)/layout.tsx
app/admin/(protected)/page.tsx
```

The route group keeps the public URLs stable while ensuring the login page is
not wrapped by `requireAdmin()`.

## Login Flow

1. The administrator opens `/admin/login`.
2. The server action trims/normalizes the email but leaves the password opaque.
3. `signInWithPassword()` authenticates on one Supabase server client.
4. That same client calls `getClaims()` and reads the active
   `admin_members` row.
5. Authenticated non-members are signed out and rejected.
6. The protected admin layout is revalidated before redirecting to `/admin`.

The UI only exposes generic authentication errors and never reveals whether an
email address exists.

## Verified Claims and Authorization

Protected server code uses:

```ts
supabase.auth.getClaims()
```

Do not use `getSession()` as an authorization check in server code. Protected
pages and state-changing admin actions must continue to authorize through
`requireAdmin()`.

The allowed admin roles are:

- `owner`
- `admin`
- `analyst`

A user must have a matching `user_id`, an allowed role, and
`is_active = true`.

## Logout and Browser History Protection

Logout is POST-only and ends the current administrator session rather than
globally signing the account out from every device.

Browsers can restore a protected page from the back-forward cache without
performing a network request. The protected shell therefore mounts
`AdminSessionBoundary`:

1. A BFCache snapshot is hidden before it is stored.
2. On `pageshow` with `event.persisted`, the frozen UI remains hidden.
3. `/admin/session` revalidates identity and membership on the server.
4. A signed-out or unauthorized restore is replaced with `/admin/login`.
5. An authorized restore is reloaded so the protected server layout and dynamic
   data execute again.

This client boundary is defense in depth for browser history. The server layout
remains the real authorization boundary.

## RLS and Database Security

Row Level Security is enabled on `public.admin_members`. Authenticated users
may read only their own active membership row; normal authenticated users do
not receive direct INSERT, UPDATE, or DELETE policies.

The pending admin hardening migration also revokes anonymous execution from
internal SECURITY DEFINER helpers and uses an init-plan-safe
`(select auth.uid())` predicate for self-membership reads.

## Security Rules

- No public admin signup.
- No service-role or secret key in browser/application admin code.
- No client-side email allowlist for administrator identity.
- No raw Supabase authentication errors shown to users.
- No auth token logging.
- Server authorization required for every protected page and state-changing
  admin action.
- Admin responses are private/no-store.
- Logout is current-session only.
- BFCache/history restoration fails closed.
- Public PDF document processing remains outside the admin auth system.

## Production Checklist

Before declaring the release production-ready:

- Required Supabase URL/publishable-key environment variables are configured.
- The administrator account and active membership exist.
- `20260919001_admin_security_hardening.sql` has been applied through the
  approved post-merge migration workflow.
- Supabase security advisors are rerun after the migration and internal
  anonymous SECURITY DEFINER warnings are resolved as expected.
- Supabase Auth leaked-password protection is enabled for administrator
  password security.
- Unauthenticated `/admin` redirects to `/admin/login`.
- Chromium and WebKit/iPhone pass login, persistence, mobile navigation,
  Realtime, logout, repeated Back/Forward protection, and re-login.
- No browser console/page errors appear during the lifecycle.
- Public-route, PDF-tool, HEIC, lint, TypeScript, unit-test, and production
  build gates remain green.
- Production is verified only after merge/deploy; preview or branch success is
  not reported as production success.
