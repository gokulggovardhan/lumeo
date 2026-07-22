# Lumeo Control Center Admin Authentication

This phase adds secure Supabase administrator authentication for Lumeo Control
Center. It does not replace Firebase, the existing public login, the dashboard,
PDF tools, or any document processing engine.

## Architecture

- Supabase Auth provides email/password administrator sign-in.
- `public.admin_members` stores active admin memberships and roles.
- `lib/admin/auth.ts` verifies identity with Supabase claims and checks active
  membership server-side.
- `/admin/login` is public, outside the protected route group, and has no signup
  path.
- `/admin` is protected by `app/admin/(protected)/layout.tsx`, which calls
  `requireAdmin()` before rendering protected admin screens.
- `/admin/logout` signs out through a POST route.
- `proxy.ts` refreshes Supabase cookies but is not the only authorization layer.

## Route Structure

The admin route tree intentionally keeps public and protected routes separate:

```text
app/admin/login/page.tsx
app/admin/login/actions.ts
app/admin/logout/route.ts
app/admin/(protected)/layout.tsx
app/admin/(protected)/page.tsx
```

The route group preserves the public URLs:

```text
/admin/login
/admin
/admin/logout
```

There is no protecting root `app/admin/layout.tsx`, so the login page cannot be
wrapped by `requireAdmin()` and cannot redirect to itself.

## Login Flow

1. An administrator opens `/admin/login`.
2. The server action receives email and password.
3. The email is trimmed and normalized.
4. Supabase `signInWithPassword()` authenticates the user.
5. The server checks verified claims and active `admin_members` membership.
6. Non-admin users are signed out immediately.
7. Authorized admins are redirected to `/admin`.

The UI only shows generic failures such as:

```text
Unable to sign in with those credentials.
```

It never reveals whether an email exists.

## Verified Claims Flow

Admin authorization uses:

```ts
supabase.auth.getClaims()
```

`getSession()` must not be trusted for authorization. Claims provide the
verified user id used for membership lookup.

## admin_members Authorization

The `public.admin_members` table includes:

- `user_id`
- `role`
- `is_active`
- `created_at`
- `updated_at`

The allowed roles are:

- `owner`
- `admin`
- `analyst`

An admin must have a matching `user_id` and `is_active = true`.

## RLS Policy

Row Level Security is enabled on `public.admin_members`.

Authenticated users may only read their own membership row:

```sql
auth.uid() = user_id
```

Normal authenticated users do not receive INSERT, UPDATE, or DELETE policies.

## Why Proxy Is Not The Only Authorization Layer

Proxy refreshes Supabase authentication cookies during requests. It does not
query `admin_members` and does not make role decisions.

Every protected admin page must remain under `app/admin/(protected)`, where the
protected layout calls server authorization through `requireAdmin()`.

## Manual Supabase Setup

1. Open the Supabase Dashboard.
2. Run `supabase/migrations/20260712001_admin_members.sql` in the SQL editor or
   through your approved migration workflow.
3. Confirm Row Level Security is enabled for `public.admin_members`.
4. Add the required public environment variables in local and Vercel
   environments:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## How To Create The First Administrator

1. Supabase Dashboard
2. Authentication
3. Users
4. Add user
5. Create the administrator with a strong password
6. Copy the generated user UUID
7. SQL Editor
8. Run:

```sql
insert into public.admin_members (user_id, role, is_active)
values ('COPIED_USER_UUID', 'owner', true);
```

Never put a real email, password, UUID, key, or project secret in source code.

## How To Disable An Administrator

Set `is_active` to false for the administrator membership:

```sql
update public.admin_members
set is_active = false
where user_id = 'COPIED_USER_UUID';
```

## Security Rules

- No public signup.
- No service-role key.
- No secret key.
- No admin email allowlist stored in client code.
- No administrator identity controlled by `NEXT_PUBLIC` variables.
- No raw Supabase errors shown.
- No auth token logging.
- No PDF files or contents stored.
- No filenames stored.
- No extracted text stored.
- No document metadata stored.
- No analytics yet.
- RLS enabled.
- Server authorization required on every protected admin page.

## Production Checklist

- Supabase project URL and publishable key are configured.
- The admin membership migration has been applied.
- The first administrator user has been created manually.
- The first administrator membership has been inserted manually.
- `/admin/login` accepts only valid Supabase credentials.
- Non-member authenticated users are signed out and rejected.
- `/admin` redirects unauthenticated users to `/admin/login`.
- `/admin/logout` works through POST.

## Next Phase

The next phase is privacy-preserving analytics. It should define event shape,
retention, aggregation, and privacy limits before storing any operational data.
