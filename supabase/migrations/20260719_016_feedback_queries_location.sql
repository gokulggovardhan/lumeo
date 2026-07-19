-- Single, safe-to-run-once script for the Feedback & Query system. Brings the
-- database to the correct final state regardless of whether 014 and/or 015
-- fully, partially, or never applied -- every statement is idempotent.
-- Adds `location` (city/region/country only, e.g. "Pune, MH, IN"), derived
-- server-side from Vercel's edge network on submit. No IP address is ever
-- read or stored.

begin;

do $$
begin
  if to_regprocedure('public.is_active_admin()') is null then
    raise exception 'Missing required function public.is_active_admin(). Run 20260712_002_control_center_foundation.sql first.';
  end if;
end;
$$;

create table if not exists public.feedback_queries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('Query', 'Feedback')),
  name text not null,
  email text,
  phone text,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  constraint feedback_queries_name_check check (char_length(name) > 0 and char_length(name) <= 150),
  constraint feedback_queries_subject_check check (char_length(subject) > 0 and char_length(subject) <= 150),
  constraint feedback_queries_message_check check (char_length(message) > 0 and char_length(message) <= 2000),
  constraint feedback_queries_email_check check (email is null or char_length(email) <= 254),
  constraint feedback_queries_phone_check check (phone is null or char_length(phone) <= 30)
);

comment on table public.feedback_queries is
  'Public "Feedback & Query" widget submissions. Insert-only for anon; read/update/delete restricted to active administrators. No public SELECT policy exists -- submissions are private once sent.';

alter table public.feedback_queries
  add column if not exists location text;

alter table public.feedback_queries
  drop constraint if exists feedback_queries_location_check;
alter table public.feedback_queries
  add constraint feedback_queries_location_check check (location is null or char_length(location) <= 200);

comment on column public.feedback_queries.location is
  'Approximate city/region/country of the submitter, e.g. "Pune, MH, IN", derived server-side from Vercel edge geo headers. Never an IP address or precise coordinates.';

create index if not exists feedback_queries_created_at_idx on public.feedback_queries (created_at desc);
create index if not exists feedback_queries_is_read_idx on public.feedback_queries (is_read);
create index if not exists feedback_queries_type_idx on public.feedback_queries (type);

alter table public.feedback_queries enable row level security;

drop policy if exists "Anyone can submit feedback or a query" on public.feedback_queries;
create policy "Anyone can submit feedback or a query"
on public.feedback_queries
for insert
to anon, authenticated
with check (true);

drop policy if exists "Admins can read feedback and queries" on public.feedback_queries;
create policy "Admins can read feedback and queries"
on public.feedback_queries
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "Admins can update feedback and queries" on public.feedback_queries;
create policy "Admins can update feedback and queries"
on public.feedback_queries
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

drop policy if exists "Admins can delete feedback and queries" on public.feedback_queries;
create policy "Admins can delete feedback and queries"
on public.feedback_queries
for delete
to authenticated
using (public.is_active_admin());

revoke all on table public.feedback_queries from anon;
grant insert on table public.feedback_queries to anon;

revoke all on table public.feedback_queries from authenticated;
grant insert, select, update, delete on table public.feedback_queries to authenticated;

commit;

-- Realtime in its own transaction -- can never take the table above down
-- with it, no matter what state the publication is in on this project.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_queries'
    ) then
      alter publication supabase_realtime add table public.feedback_queries;
    end if;
  end if;
exception
  when others then
    raise notice 'Could not add feedback_queries to supabase_realtime publication (%). The table and its permissions are unaffected -- only live updates in the admin inbox are skipped.', sqlerrm;
end;
$$;
