# Privacy Analytics

Phase 5 adds first-party, privacy-preserving product analytics for Lumeo PDF.
It does not add a third-party analytics provider and it does not change PDF
processing.

## Architecture

- Public UI calls `components/analytics/AnalyticsProvider`.
- The provider checks Do Not Track and the public analytics setting.
- Provider availability is explicit: `loading`, `enabled`, or `disabled`.
- `track()` returns whether the event was accepted for delivery or rejected
  because analytics is loading, disabled, unavailable, blocked by Do Not Track,
  or invalid.
- Events are sent directly through the Supabase publishable client.
- The client calls only `public.record_public_analytics_event(...)`.
- Admin pages read aggregate analytics through existing authenticated Supabase
  admin data access.

## Initialization And Delivery

Analytics starts in a loading state while the public setting is resolved. Public
page views and one-time `tool_opened` events wait for the provider to become
enabled before they mark themselves as sent. This prevents early mount events
from being lost when the setting check finishes after the PDF tool has already
rendered.

When analytics is disabled or Do Not Track is enabled, those events are skipped
without retries. PDF work and downloads never wait for analytics and analytics
failures never block the UI.

There is no persistent event queue, no `localStorage`, and no retry loop.
Temporary anonymous analytics state remains limited to `sessionStorage`.

## Event Allowlist

Only these event names are accepted:

- `page_view`
- `tool_opened`
- `processing_started`
- `processing_succeeded`
- `processing_failed`
- `download_started`

The database RPC rejects unsupported event names.

## Anonymous Session Design

The browser creates a random UUID with `crypto.randomUUID()` and stores it in
`sessionStorage`. The ID lasts only for the browser tab/session and is not
combined with email, account IDs, IP addresses, fingerprints, or document data.

## Do Not Track

If `navigator.doNotTrack` is `"1"`, optional analytics are disabled in the
browser. The provider also disables analytics when the public setting is missing
or unavailable.

## Data Collected

- Approved event name
- Known public tool slug when relevant
- Temporary anonymous session ID
- Duration in milliseconds for processing events
- Coarse input and output size buckets
- Coarse device class
- Coarse browser family
- Coarse operating-system family
- Boolean success state
- Approved generic error code

## Data Explicitly Not Collected

- PDF files
- Filenames
- Document contents
- Extracted text
- Thumbnails
- Exact file sizes
- Raw IP addresses
- Email addresses
- Authenticated user IDs
- Passwords
- Access tokens or refresh tokens
- Full user-agent strings
- Query-string values
- Document metadata

## Size Bucketing

Exact byte counts are not sent. File sizes are mapped to:

- `under_1mb`
- `1mb_to_5mb`
- `5mb_to_20mb`
- `20mb_to_50mb`
- `over_50mb`
- `unknown`

## Device, Browser, And OS Classification

The browser module derives only coarse labels:

- Device: `desktop`, `tablet`, `mobile`, `unknown`
- Browser: `Chrome`, `Edge`, `Firefox`, `Safari`, `Other`, `Unknown`
- OS: `Windows`, `macOS`, `Linux`, `Android`, `iOS`, `Other`, `Unknown`

It does not store screen resolution, installed fonts, canvas hashes, hardware
IDs, or a persistent browser fingerprint.

## Public RPC Security

Migration `20260712004_privacy_analytics.sql` creates:

- `public.get_public_analytics_setting()`
- `public.record_public_analytics_event(...)`
- `public.refresh_daily_tool_metrics(date)`

The public event RPC validates all inputs, derives `occurred_at` internally,
rejects unsupported tools/events, and does not accept metadata JSON, country,
IP, user identity, email, filenames, or exact file sizes.

No direct anonymous table access is granted for `analytics_events`.

## Abuse-Control Limitations

The RPC limits event volume per temporary anonymous session and applies a
stricter limit for null sessions. It intentionally does not use IP addresses,
emails, user IDs, or persistent fingerprints for throttling, so abuse controls
are privacy-preserving but not as strong as identity-based rate limits.

## Collection Setting

The approved setting key is:

```text
public_analytics_enabled
```

Production collection is disabled unless this setting explicitly resolves to
true through the public setting RPC. Local development can use
`NEXT_PUBLIC_ANALYTICS_DEBUG=true` for testing.

## Analytics V1 Scope

Analytics V1 scope is intentionally limited and explicit.

Analytics V1 is intentionally limited to discovery analytics:

- `page_view`
- `tool_opened`
- total public events
- page views today
- tool opens today
- top tools by opens
- coarse device class
- coarse browser family
- coarse operating-system family
- temporary anonymous session counts in aggregate form only
- latest event timestamp
- seven-day page-view and tool-open trends

Operation lifecycle analytics remains Planned for a later shared browser-tool
framework:

- `processing_started`
- `processing_succeeded`
- `processing_failed`
- `download_started`
- processing success rate
- average processing duration

The schema and RPC allowlists keep those event names reserved so historical
rows and future migration history remain compatible. The current Merge, Split,
and Compress components do not emit operation lifecycle events in Analytics V1.
The Control Center labels those metrics as planned instead of displaying
misleading zero cards.

## Admin Analytics Views

The Control Center analytics page shows real data only:

- events today
- tool opens
- page views
- seven-day page-view and tool-open activity
- top tools
- device/browser/OS summaries

Anonymous session IDs and individual event rows are not displayed.

## Secure Admin Aggregate Reads

Admin pages do not receive direct `SELECT` access to `analytics_events`.
Individual event rows include temporary anonymous session IDs and other coarse
technical fields, so the application reads them only through an admin-only
aggregate RPC:

```text
public.get_admin_analytics_summary(p_start_date date, p_end_date date)
```

The RPC is available to active `owner`, `admin`, and `analyst` members through
authenticated Supabase sessions. It rejects unauthenticated users, inactive
members, non-admin authenticated users, invalid dates, and ranges over 90 days.

It returns aggregate fields only:

- summary counts for total events, tool opens, processing started, processing
  succeeded, processing failed, downloads, total successful duration, average
  successful duration, and latest event timestamp
- daily trend rows
- top tools by opens
- top tools by successful processing
- generic error-code summary
- device-class summary
- browser-family summary
- operating-system summary

It never returns individual events, event IDs, anonymous session IDs, user IDs,
emails, filenames, exact file sizes, raw IP addresses, full user-agent strings,
tokens, raw metadata, or document information.

The Control Center distinguishes two separate states:

- aggregate data is available and genuinely zero
- aggregate data is unavailable because the secure RPC failed or returned a
  malformed response

When unavailable, the dashboard shows a restrained warning instead of displaying
zero cards as if they were valid metrics.

## Daily Metric Refresh

`public.refresh_daily_tool_metrics(target_date)` aggregates real
`analytics_events` rows into `daily_tool_metrics`. It is callable only by active
owners/admins. No cron job is added in this phase.

Daily metric rows remain useful as a persisted rollup and system-readiness
signal. The admin analytics dashboard uses the secure aggregate RPC for live
summary and breakdown data so it does not need direct table access.

## PDF Tool Event Lifecycle

> Updated 2026-07-29: this section originally described only Merge, Split, and
> Compress. All 14 live PDF tools now use the same Analytics V1 workspace-open
> lifecycle described below.

Every live PDF tool currently uses the same Analytics V1 workspace-open
lifecycle:

- `tool_opened` fires once per mounted tool workspace after analytics becomes
  enabled. The one-time ref is marked only when `track()` returns
  `accepted: true`.

Operation events remain planned:

- `processing_started`
- `processing_succeeded`
- `processing_failed`
- `download_started`

Those events will be reintroduced through one shared browser-tool lifecycle so
future tools do not duplicate per-component analytics wiring. Until then,
processing and download analytics are intentionally not emitted. PDF processing
and downloads remain independent of analytics, with no persistent queue and no
retry loop.

Tool analytics payloads include only approved event names and tool slugs in V1.
They exclude filenames, exact file sizes, page counts, output names, document
text, thumbnails, PDF metadata, stack traces, and raw error messages.

## Manual Migration Procedure

Do not execute SQL from the application task.

1. Review `supabase/migrations/20260712004_privacy_analytics.sql`.
2. Open Supabase SQL Editor.
3. Paste migration 004.
4. Run it.
5. Verify RPC permissions.
6. Verify no anonymous table access exists for `analytics_events`.
7. Enable `public_analytics_enabled` from Control Center.
8. Generate test events from public tools.
9. Verify the analytics dashboard.
10. Test Do Not Track.
11. Test analytics disabled.
12. Test PDF processing with Supabase unavailable.

### Migration 005 Procedure

Do not execute SQL from the application task.

1. Review `supabase/migrations/20260714005_admin_analytics_reads.sql`.
2. Open Supabase SQL Editor.
3. Paste migration 005.
4. Run it.
5. Verify `get_admin_analytics_summary(date, date)` exists.
6. Verify `anon` cannot execute it.
7. Verify `authenticated` has execute permission.
8. Verify `analytics_events` still has no broad authenticated `SELECT`.
9. Sign in as an owner.
10. Open `/admin/analytics`.
11. Confirm raw aggregate cards show real values.
12. Confirm daily metrics remain visible.
13. Test an inactive or non-admin account if available.
14. Confirm no individual events or session IDs appear.

## Testing Procedure

- `npm.cmd run verify:supabase`
- `npm.cmd run verify:admin-auth`
- `npm.cmd run verify:control-center`
- `npm.cmd run verify:public-catalog`
- `npm.cmd run verify:analytics`
- `npm.cmd run build`
- `npm.cmd run verify:public`
- `git diff --check`

## Rollback Procedure

Rollback can remove migration 004 functions and disable
`public_analytics_enabled`. Existing public PDF processing remains browser-only
and does not depend on analytics success.

Migration 005 rollback can drop only
`public.get_admin_analytics_summary(date, date)`. Public analytics recording and
daily metric refresh remain unchanged.

## Privacy And Legal Review Note

This implementation avoids documents, filenames, exact file sizes, raw IPs, and
persistent identity. Legal requirements vary by jurisdiction, so production
analytics should still receive privacy/legal review before broad enablement.

## Next Phase

Production monitoring, alerting, retention rules, and scheduled daily metric
aggregation.
