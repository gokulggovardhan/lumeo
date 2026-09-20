begin;

-- Public feedback submission is RPC-only. Direct anonymous/authenticated table
-- INSERT grants are removed so callers cannot bypass validation, honeypot
-- handling in the application route, or the database-side abuse controls.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.feedback_ingest_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null,
  event_count integer not null check (event_count >= 0)
);

create index if not exists feedback_ingest_rate_limits_window_idx
  on private.feedback_ingest_rate_limits (window_started_at);

revoke all on table private.feedback_ingest_rate_limits from public;
revoke all on table private.feedback_ingest_rate_limits from anon, authenticated;

create or replace function public.record_feedback_query(
  p_type text,
  p_name text,
  p_subject text,
  p_message text,
  p_email text default null,
  p_phone text default null,
  p_location text default null,
  p_anonymous_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned_type text := btrim(coalesce(p_type, ''));
  cleaned_name text := btrim(coalesce(p_name, ''));
  cleaned_subject text := btrim(coalesce(p_subject, ''));
  cleaned_message text := btrim(coalesce(p_message, ''));
  cleaned_email text := nullif(btrim(coalesce(p_email, '')), '');
  cleaned_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  cleaned_location text := nullif(btrim(coalesce(p_location, '')), '');
  actor_user_id uuid := auth.uid();
  actor_bucket text;
  accepted_count integer;
  inserted_id uuid;
  actor_limit constant integer := 5;
  anonymous_global_limit constant integer := 100;
  rate_window constant interval := interval '10 minutes';
begin
  if cleaned_type not in ('Query', 'Feedback') then
    raise exception 'Invalid feedback type.';
  end if;
  if char_length(cleaned_name) < 1 or char_length(cleaned_name) > 150 then
    raise exception 'Invalid feedback name.';
  end if;
  if char_length(cleaned_subject) < 1 or char_length(cleaned_subject) > 150 then
    raise exception 'Invalid feedback subject.';
  end if;
  if char_length(cleaned_message) < 1 or char_length(cleaned_message) > 2000 then
    raise exception 'Invalid feedback message.';
  end if;
  if cleaned_email is not null and (
    char_length(cleaned_email) > 254
    or cleaned_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'Invalid feedback email.';
  end if;
  if cleaned_phone is not null and (
    char_length(cleaned_phone) > 30
    or cleaned_phone !~ '^\+?[0-9[:space:]().-]{7,20}$'
  ) then
    raise exception 'Invalid feedback phone.';
  end if;
  if cleaned_location is not null and char_length(cleaned_location) > 200 then
    raise exception 'Invalid feedback location.';
  end if;

  actor_bucket := case
    when actor_user_id is not null then 'user:' || actor_user_id::text
    when p_anonymous_session_id is not null then 'session:' || p_anonymous_session_id::text
    else 'anon:null'
  end;

  delete from private.feedback_ingest_rate_limits
  where window_started_at < now() - interval '1 day';

  accepted_count := null;
  insert into private.feedback_ingest_rate_limits as limits (
    bucket,
    window_started_at,
    event_count
  )
  values (actor_bucket, now(), 1)
  on conflict (bucket) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - rate_window then now()
      else limits.window_started_at
    end,
    event_count = case
      when limits.window_started_at <= now() - rate_window then 1
      else limits.event_count + 1
    end
  where
    limits.window_started_at <= now() - rate_window
    or limits.event_count < actor_limit
  returning event_count into accepted_count;

  if accepted_count is null then
    raise exception 'Feedback submission rate limit reached.';
  end if;

  if actor_user_id is null then
    accepted_count := null;
    insert into private.feedback_ingest_rate_limits as limits (
      bucket,
      window_started_at,
      event_count
    )
    values ('anon:global', now(), 1)
    on conflict (bucket) do update
    set
      window_started_at = case
        when limits.window_started_at <= now() - rate_window then now()
        else limits.window_started_at
      end,
      event_count = case
        when limits.window_started_at <= now() - rate_window then 1
        else limits.event_count + 1
      end
    where
      limits.window_started_at <= now() - rate_window
      or limits.event_count < anonymous_global_limit
    returning event_count into accepted_count;

    if accepted_count is null then
      raise exception 'Feedback submission rate limit reached.';
    end if;
  end if;

  insert into public.feedback_queries (
    type,
    name,
    email,
    phone,
    subject,
    message,
    location
  )
  values (
    cleaned_type,
    cleaned_name,
    cleaned_email,
    cleaned_phone,
    cleaned_subject,
    cleaned_message,
    cleaned_location
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.record_feedback_query(text, text, text, text, text, text, text, uuid) is
  'Validated public feedback/query submission with database-side per-actor and global anonymous rate limits.';

-- No direct public table insertion remains. Public submission goes through the
-- validated SECURITY DEFINER RPC above; administrator SELECT/UPDATE/DELETE
-- stays governed by the existing RLS policies.
drop policy if exists "Anyone can submit feedback or a query" on public.feedback_queries;
revoke insert on table public.feedback_queries from anon;
revoke insert on table public.feedback_queries from authenticated;

comment on table public.feedback_queries is
  'Private Feedback & Query inbox. Public writes are accepted only through record_feedback_query(...); reads and administrative changes require an active administrator.';
comment on column public.feedback_queries.location is
  'Approximate city/region/country derived server-side from Cloudflare request location. Never an IP address or precise coordinates.';

revoke execute on function public.record_feedback_query(text, text, text, text, text, text, text, uuid) from public;
grant execute on function public.record_feedback_query(text, text, text, text, text, text, text, uuid)
  to anon, authenticated, service_role;

commit;
