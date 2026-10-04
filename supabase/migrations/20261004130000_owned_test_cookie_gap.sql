begin;

-- Repair only the 13 schema-v2 USA operational events proven to belong to
-- Lumeo-owned production browser tests. Evidence:
-- - zero corresponding real-audience page views,
-- - standard CI Chrome/Firefox on Linux,
-- - Cloudflare US runner locations,
-- - direct/no-referrer operational events on known production test routes,
-- - 12/13 share the exact privacy-safe visitor/session identity with synthetic
--   page views; the remaining row sits immediately after the same synthetic
--   Firefox test sequence.
--
-- Geography is not changed. Only the traffic classification is corrected.

update public.analytics_events
set
  traffic_class = 'synthetic',
  traffic_class_reason = 'historical_owned_test_cookie_gap'
where analytics_schema_version = 2
  and traffic_class = 'real_audience'
  and id in (
    27129, 27137, 27790, 27793, 28216, 28640, 28681,
    28891, 28898, 29139, 29232, 30038, 30131
  );

commit;
