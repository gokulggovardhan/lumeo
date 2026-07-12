# Lumeo Supabase Foundation

This phase adds the Supabase client foundation for Lumeo without changing PDF
processing, Firebase authentication, the dashboard, or existing Studio flows.

## Architecture

- `lib/supabase/env.ts` validates the two public Supabase environment variables.
- `lib/supabase/client.ts` creates the browser Supabase client.
- `lib/supabase/server.ts` creates the server Supabase client for App Router
  server usage.
- `lib/supabase/proxy.ts` refreshes and verifies auth state for Next.js Proxy.
- `proxy.ts` wires Supabase session refresh into the Next.js request flow.

Only the Supabase publishable key is used. No service-role or database secret is
used by this foundation.

## Browser Client

Use `createClient()` from `lib/supabase/client.ts` in client components.

The browser client reads:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Publishable keys are designed for browser use and must still be protected by
Supabase row-level security policies in later database phases.

## Server Client

Use `await createClient()` from `lib/supabase/server.ts` in App Router server
contexts.

The server client uses `await cookies()` for Next.js 16 and supports cookie
`getAll` and `setAll`. The implementation ignores only the known cookie-write
failure that can happen in Server Components; unrelated errors are rethrown.

## Proxy Session Refresh

The root `proxy.ts` file calls `updateSession(request)`.

The Proxy:

- synchronizes request and response cookies;
- refreshes Supabase authentication cookies;
- calls `supabase.auth.getClaims()` for verified identity checks;
- must not trust `getSession()` for authorization;
- does not protect, redirect, or authorize any route yet.

## Local Environment Setup

Create `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Run:

```powershell
npm.cmd run verify:supabase
```

The verifier checks only that both values exist and that the URL is HTTPS. It
does not print credential values.

## Vercel Environment Setup

Add the same variables in Vercel project settings for the relevant environments:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not add service-role or database password values to browser-exposed
environment variables.

## Security Rules

- Do not use `SUPABASE_SERVICE_ROLE_KEY` in this application foundation.
- Do not prefix secret keys with `NEXT_PUBLIC`.
- Do not store PDFs, filenames, document contents, extracted text, thumbnails,
  passwords, tokens, or private keys in Supabase as part of this phase.
- Keep PDF processing browser-only unless a future phase explicitly designs a
  secure server-side workflow.
- Keep authorization decisions for a later dedicated admin/auth phase.

## Next Phase

The next phase is secure admin authentication and role authorization. That phase
should define user identity, role storage, protected routes, and database row
level security before any privileged Supabase data access is introduced.
