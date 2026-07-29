# Analytics Certification

Release commit: `332fe8d` (main, post-#121)
Date: 2026-07-30
Status: **RECONCILED** (previously blocked — see "History" below)

## Result

Every dashboard metric on `https://lumeo.in/admin/analytics` was checked
against a direct SQL query against the raw `analytics_events` table (run
by the project owner in the Supabase SQL editor, using their own
credentials — no key or secret was shared with or handled by this
session). All 9 checkable metrics matched exactly, for the "Today" window
(2026-07-29, UTC).

| Metric | Raw query (`analytics_events`) | Dashboard | Match |
|---|---|---|---|
| Unique Visitors Today | 7 (`count(distinct anonymous_session_id)`, `occurred_at` in today's UTC day) | 7 | ✅ |
| Events Today | 40 (sum of all event rows for the day) | 40 | ✅ |
| Page Views Today | 21 (`event_name = 'page_view'`) | 21 | ✅ |
| Tool Opens Today | 12 (`event_name = 'tool_opened'`) | 12 | ✅ |
| Processing Started | 3 (`event_name = 'processing_started'`) | 3 | ✅ |
| Processing Succeeded | 2 (`event_name = 'processing_succeeded'`) | 2 | ✅ |
| Processing Failed | 1 (`event_name = 'processing_failed'`) | 1 | ✅ |
| Success Rate | 2 ÷ (2+1) = 66.7% | 66.7% | ✅ |
| Downloads Started | 1 (`event_name = 'download_started'`) | 1 | ✅ |

## Queries used

```sql
-- Per-event totals and distinct sessions, last 7 days
select event_name, count(*) as total, count(distinct anonymous_session_id) as unique_sessions
from analytics_events
where occurred_at >= now() - interval '7 days'
group by event_name
order by event_name;

-- Daily breakdown, last 7 days
select date(occurred_at) as day, event_name, count(*) as total
from analytics_events
where occurred_at >= now() - interval '7 days'
group by day, event_name
order by day, event_name;

-- Unique sessions for today (UTC) specifically
select count(distinct anonymous_session_id) as unique_sessions_today
from analytics_events
where occurred_at >= date_trunc('day', now() at time zone 'utc')
  and occurred_at < date_trunc('day', now() at time zone 'utc') + interval '1 day';
```

## What this confirms

- No double-counting: `Events Today` (40) equals the exact sum of the
  6 per-event-type counts for the day (1+21+1+3+2+12), with no
  duplicate or phantom events inflating the total.
- No drift between the aggregate RPC the dashboard reads
  (`get_admin_analytics_summary`-style aggregate, per `lib/admin/data.ts`,
  confirmed in the earlier security pass to be RPC-backed rather than a
  direct table read) and the raw event log.
- The `Success Rate` card's formula (`succeeded ÷ (succeeded + failed)`)
  is implemented exactly as documented, not approximated.
- UTC day-bucketing is consistent between the dashboard's "Today" and a
  `date_trunc('day', ... at time zone 'utc')` query — no timezone-offset
  discrepancy found for this comparison window.

## What's still not covered

This reconciliation covers **one day's worth of "Today" metrics only**.
Not yet checked:

- The 7-day trend chart / bar-list breakdowns (device class, browser
  family, OS, top tools by opens/success) — the raw daily-breakdown query
  above only reconciles `page_view`/`tool_opened` counts per day, not
  every dashboard widget.
- Deduplication logic under retry/reconnect scenarios (a session
  reloading mid-operation) — not specifically tested.
- A day with zero events, or a day spanning a UTC boundary right at
  midnight, as an edge case.

These are lower-priority now that the core numbers are confirmed
trustworthy; re-run the same method for a wider window if a dashboard
widget beyond what's listed above is ever in doubt.

## History

The original attempt (this session, immediately after PR #117 merged)
was blocked: no admin login credentials and no Supabase service-role key
were available to the AI session. Per this project's hard rule (secrets/
API keys are never accepted or handled in chat), the project owner ran
the queries themselves in the Supabase SQL editor and pasted back the
*results* — not credentials — which is what made this reconciliation
possible without compromising anything.
