begin;

do $$
begin
  if to_regprocedure('public.is_active_admin()') is null then
    raise exception 'Missing required function public.is_active_admin(). Run 20260712002_control_center_foundation.sql before 20260719014_feedback_queries.sql.';
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

-- No public SELECT policy: anon and unauthenticated authenticated-but-not-admin
-- users can insert but never read back what they or anyone else submitted.
revoke all on table public.feedback_queries from anon;
grant insert on table public.feedback_queries to anon;

revoke all on table public.feedback_queries from authenticated;
grant insert, select, update, delete on table public.feedback_queries to authenticated;

-- Realtime enablement deliberately omitted here: adding an already-member
-- table to a publication errors and would roll back this entire migration
-- (table included). See 20260719015_fix_feedback_queries_realtime.sql,
-- which enables it afterward in its own transaction, guarded and tolerant
-- of every prior state.

commit;
