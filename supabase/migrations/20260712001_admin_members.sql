begin;

create table if not exists public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_members_role_check check (role in ('owner', 'admin', 'analyst'))
);

comment on table public.admin_members is
  'Administrator memberships for Lumeo Control Center. Does not store passwords, tokens, PDFs, filenames, document metadata, or extracted text.';
comment on column public.admin_members.user_id is
  'Supabase auth user id for an administrator.';
comment on column public.admin_members.role is
  'Administrator role: owner, admin, or analyst.';
comment on column public.admin_members.is_active is
  'Controls whether this administrator can access Lumeo Control Center.';
comment on column public.admin_members.created_at is
  'Membership creation timestamp.';
comment on column public.admin_members.updated_at is
  'Membership last update timestamp.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_members_updated_at on public.admin_members;

create trigger set_admin_members_updated_at
before update on public.admin_members
for each row
execute function public.set_updated_at();

alter table public.admin_members enable row level security;

drop policy if exists "Admin members can read their own membership" on public.admin_members;

create policy "Admin members can read their own membership"
on public.admin_members
for select
to authenticated
using (auth.uid() = user_id);

revoke all on table public.admin_members from anon;
revoke all on table public.admin_members from authenticated;
grant select on table public.admin_members to authenticated;

revoke all on function public.set_updated_at() from public;

-- Manual first-admin bootstrap example. Replace the placeholder with a real
-- Supabase Authentication user UUID in the Supabase SQL Editor.
-- insert into public.admin_members (user_id, role)
-- values ('AUTH_USER_UUID_HERE', 'owner');

commit;
