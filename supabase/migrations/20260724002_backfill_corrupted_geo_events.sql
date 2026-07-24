begin;

do $$
begin
  if to_regclass('public.analytics_events') is null then
    raise exception 'Missing required table public.analytics_events. Run 20260712004_privacy_analytics.sql first.';
  end if;
end;
$$;

-- One-time data backfill for the geo-cookie double-encoding bug fixed in
-- lib/supabase/proxy.ts / lib/analytics/geo.ts (see that commit). Every
-- event recorded before that fix has its city/region/country crammed into
-- the `city` column alone as a single "city|region|country" string (e.g.
-- "Pune|MH|IN", or "San%20Jose|CA|US" when the city name itself needed
-- escaping), with region and country_code left null -- visible in the
-- admin console as garbled duplicate-looking rows instead of a clean
-- "Pune, Maharashtra, India".
--
-- Region and country codes are always plain ASCII (postal/ISO codes never
-- contain characters that need percent-decoding), so those two split out
-- cleanly with split_part. City names can contain percent-encoded spaces
-- etc that plain SQL can't safely decode -- for those, city is set to null
-- rather than left corrupted; the recovered region/country still displays
-- (e.g. "Maharashtra, India") instead of raw junk. Only rows matching the
-- exact known corruption shape (two pipes, region and country_code both
-- still null) are touched.
update public.analytics_events
set
  country_code = nullif(upper(left(split_part(city, '|', 3), 3)), ''),
  region = nullif(split_part(city, '|', 2), ''),
  city = case
    when split_part(city, '|', 1) = '' then null
    when position('%' in split_part(city, '|', 1)) > 0 then null
    else split_part(city, '|', 1)
  end
where city ~ '^[^|]*\|[^|]*\|[^|]*$'
  and region is null
  and country_code is null;

commit;
