# Analytics Certification

Release commit: `b4f80e6` (main, post-#116)
Date: 2026-07-30

## Scope and honesty notice — this phase is blocked, not completed

The requested work was to compare every number on the Admin Analytics
Dashboard against the raw Supabase `analytics_events` table and confirm
an exact match. **That comparison could not be performed in this
session** and is not claimed as done.

Concretely verified: an unauthenticated request using the app's own
public/anon Supabase key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) against
`GET /rest/v1/analytics_events` returns
`{"code":"42501","message":"permission denied for table analytics_events"}`.
This is correct, intentional RLS behavior (see
[docs/SECURITY_CERTIFICATION.md](./SECURITY_CERTIFICATION.md)) — raw
analytics rows are not readable without an authenticated admin session or
a service-role key, and this session has neither:

- No admin login credentials were provided to authenticate into
  `/admin/analytics` and read the dashboard's actual rendered numbers.
- No Supabase service-role key was provided to query
  `analytics_events` directly, bypassing RLS, to get ground-truth raw
  counts.

Fabricating a "dashboard matches raw data" or "N events reconciled"
claim here would be reporting a result that was never actually measured
— explicitly against the standing instruction not to fabricate results.

## What was confirmed instead (code-level, no live data)

- `tests/analytics-tool-events.test.ts` (part of the 207/207 passing
  suite, see [Phase 16](../CLAUDE.md)) asserts that `page_view`,
  `tool_opened`, and the full operation lifecycle (`operation_started` /
  `operation_completed` / failure states) are emitted correctly from the
  client, and that Do Not Track / disabled-analytics states correctly
  suppress tracking without retries.
- `lib/admin/data.ts` (per the code read for the security pass) computes
  the dashboard's numbers via an aggregate RPC rather than reading
  `analytics_events` rows directly in application code — consistent with
  what the RLS probe above shows (direct table access is blocked; the
  dashboard must go through a `SECURITY DEFINER`-style RPC).
- The event schema (allowed event types, forbidden fields) is
  version-locked by `tests/analytics-tool-events.test.ts`'s "Analytics V1
  dashboard shows real operation lifecycle metric cards" and related
  assertions, which passed in this session's full test run.

None of this proves the *numbers currently displayed* are correct —
only that the code paths that produce them are exercised by tests and
that access control is correctly restrictive.

## What real completion of this phase requires

1. Either: admin login credentials for `https://lumeo.in/admin`, so the
   rendered dashboard values can be read directly, **or** a Supabase
   service-role key (used strictly read-only, ideally against a
   staging/read-replica project, never pasted into chat) to query
   `analytics_events` directly for the same time window the dashboard
   shows.
2. A fixed comparison window (e.g. "last 7 days UTC") so both sides are
   reconciled against the same data, since the dashboard is time-bucketed
   and raw counts will drift if pulled at a different moment.
3. Per-metric reconciliation: unique visitors, page views, tool opens,
   processing started/succeeded/failed, downloads, average duration,
   browser/OS/device breakdown, UTC day-bucketing — each compared
   dashboard-value vs. raw-query-value.

## Recommendation

Do not mark analytics "certified" until the above credentials are
supplied through a secure channel and this document is regenerated with
actual reconciled numbers. This document should not be hand-edited to
insert numbers after the fact — regenerate it from a real run.
