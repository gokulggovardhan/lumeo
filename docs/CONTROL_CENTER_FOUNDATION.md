# Lumeo Control Center Foundation

This phase adds the database and administrator interface foundation for Lumeo
Control Center. It does not execute SQL, change public PDF tools, alter Firebase
systems, or make the public homepage dynamic.

## Architecture

- Supabase Auth verifies administrators through `getClaims()`.
- `public.admin_members` remains the source of active administrator membership.
- Protected admin routes live under `app/admin/(protected)`.
- `app/admin/(protected)/layout.tsx` calls `requireAdmin()` before rendering.
- Control Center data reads are isolated in `lib/admin/data.ts`.
- Mutations use server actions beside the relevant page.
- Mutations validate input, check permissions, write audit records, and return
  safe messages.

## Route Map

```text
/admin
/admin/analytics
/admin/tools
/admin/homepage
/admin/feature-flags
/admin/announcements
/admin/seo
/admin/audit
/admin/system
/admin/settings
/admin/login
/admin/logout
```

## Tables

- `tool_categories`: PDF tool grouping.
- `pdf_tools`: managed public tool catalog.
- `homepage_tool_slots`: five configurable homepage tool slots.
- `feature_flags`: operational feature flags with JSON config.
- `site_settings`: approved settings only; no secrets.
- `announcements`: public messaging foundation.
- `seo_settings`: route SEO records; public metadata is not dynamic yet.
- `audit_logs`: administrative action history.
- `analytics_events`: privacy-preserving event schema foundation.
- `daily_tool_metrics`: aggregate daily tool metrics.

## Role Permissions

- `owner`: full read/write access, including settings.
- `admin`: may manage tools, homepage slots, announcements, feature flags, and
  SEO; may view analytics, audit, and system pages.
- `analyst`: read-only access to overview, analytics, tools, audit, and system.

The UI hides unavailable controls, but server actions also enforce permissions.

## RLS Model

Every Control Center table has Row Level Security enabled.

- Active admins may read administrative tables.
- Owners and admins may manage content tables.
- Owners may manage `site_settings`.
- Audit logs are readable to active admins.
- Audit insertion is controlled through `public.write_audit_log()`.
- No anonymous policies are created.
- Public site settings are not automatically readable.

## Audit Model

`public.write_audit_log()` derives actor ID and role from `auth.uid()` and
`public.current_admin_role()`. The browser never submits actor identity.

Audit records must not store passwords, tokens, cookies, secret values, PDF data,
filenames, document content, thumbnails, document metadata, or IP addresses.

## Analytics Privacy Model

The analytics tables are schema-only in this phase. They are designed for
anonymous aggregate operational events.

They must not store:

- raw IP addresses
- filenames
- exact file sizes
- document text
- thumbnails
- passwords
- PDF metadata

Size is bucketed, device class is coarse, and public tracking is not added in
this phase.

## Homepage Slot Rule

Slots 1-5 are configurable through `homepage_tool_slots`.

Slot 6 is permanently:

```text
All PDF Tools
```

It is not stored as a configurable slot and cannot be changed or deleted.

## Server Action Security

Every Control Center action must:

- call `requireAdmin()`;
- check a server-side permission helper;
- validate submitted values;
- avoid raw database errors in UI;
- write an audit record;
- revalidate relevant admin routes;
- never accept actor user ID or actor role from the browser.

## Local Migration Procedure

Do not run SQL automatically from the application task.

1. Review `supabase/migrations/20260712002_control_center_foundation.sql`.
2. Open the Supabase Dashboard.
3. Open SQL Editor.
4. Paste the migration SQL.
5. Run it.
6. Verify all tables exist.
7. Verify RLS is enabled.
8. Verify seeded PDF tools.
9. Verify five homepage slots.
10. Test admin pages.

## Production Migration Procedure

1. Confirm the production project is selected in Supabase.
2. Review the migration again.
3. Confirm a backup or rollback plan exists.
4. Run the migration in the approved production SQL workflow.
5. Confirm `current_admin_role()` returns the expected role for an active admin.
6. Confirm `write_audit_log()` inserts only for active admins.
7. Open `/admin` and verify all Control Center pages load.

## Rollback Considerations

This migration creates new tables and helper functions. It does not alter public
PDF tools, Firebase, Google Drive, Cloudinary, upload/export routes, or the
public homepage.

A rollback should remove only the Control Center foundation objects after
exporting any audit data that must be retained.

## Testing Checklist

- `npm.cmd run verify:supabase`
- `npm.cmd run verify:admin-auth`
- `npm.cmd run verify:control-center`
- `npm.cmd run build`
- `npm.cmd run verify:public`
- `git diff --check`

## Next Phase

The next phase should connect public tool catalog reads and privacy-preserving
event tracking. It must define collection limits before any public analytics
event is emitted.
