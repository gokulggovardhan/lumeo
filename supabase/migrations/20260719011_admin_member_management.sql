begin;

do $$
begin
  if to_regclass('public.admin_members') is null then
    raise exception 'Missing required table public.admin_members. Run 20260712001_admin_members.sql before 20260719011_admin_member_management.sql.';
  end if;

  if to_regprocedure('public.is_owner()') is null then
    raise exception 'Missing required function public.is_owner(). Run 20260712002_control_center_foundation.sql before 20260719011_admin_member_management.sql.';
  end if;
end;
$$;

-- Owners previously had to run raw SQL in the Supabase dashboard to see,
-- add, promote, or deactivate an administrator. These three functions are
-- the only supported way to do that from the Control Center: list existing
-- members with their email, add an existing auth user as a member, and
-- change a member's role/active state. None of them read or return password
-- hashes, tokens, or anything from auth.users beyond id/email/created_at.

create or replace function public.list_admin_members()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then
    raise exception 'Owner access required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'user_id', members.user_id,
        'email', users.email,
        'role', members.role,
        'is_active', members.is_active,
        'created_at', members.created_at,
        'updated_at', members.updated_at,
        'last_sign_in_at', users.last_sign_in_at
      ) order by members.created_at asc)
      from public.admin_members as members
      join auth.users as users on users.id = members.user_id
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.list_admin_members() is
  'Owner-only: lists Control Center administrators with email and last sign-in, joined from auth.users. Never returns password hashes or tokens.';

create or replace function public.add_admin_member(p_email text, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  normalized_email text;
begin
  if not public.is_owner() then
    raise exception 'Owner access required.';
  end if;

  if p_role not in ('owner', 'admin', 'analyst') then
    raise exception 'Role must be owner, admin, or analyst.';
  end if;

  normalized_email := lower(trim(p_email));
  if normalized_email = '' then
    raise exception 'Email is required.';
  end if;

  select users.id into target_user_id
  from auth.users as users
  where lower(users.email) = normalized_email
  limit 1;

  if target_user_id is null then
    raise exception 'No account exists for that email yet. The person needs a Supabase Authentication account first (create one in the Supabase dashboard), then they can be added here.';
  end if;

  insert into public.admin_members (user_id, role, is_active)
  values (target_user_id, p_role, true)
  on conflict (user_id) do update set role = excluded.role, is_active = true;

  return jsonb_build_object('user_id', target_user_id, 'email', normalized_email, 'role', p_role);
end;
$$;

comment on function public.add_admin_member(text, text) is
  'Owner-only: links an existing Supabase auth user (by email) as a Control Center administrator with the given role. Does not create auth accounts.';

create or replace function public.update_admin_member(p_user_id uuid, p_role text, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  acting_user_id uuid;
  owner_count int;
begin
  if not public.is_owner() then
    raise exception 'Owner access required.';
  end if;

  if p_role not in ('owner', 'admin', 'analyst') then
    raise exception 'Role must be owner, admin, or analyst.';
  end if;

  acting_user_id := auth.uid();

  -- Guard against an owner locking themselves out entirely, and against
  -- demoting/deactivating the last remaining owner (there would then be no
  -- one left who can manage settings or membership at all).
  if p_user_id = acting_user_id and (p_role <> 'owner' or p_is_active = false) then
    raise exception 'You cannot demote or deactivate your own owner account.';
  end if;

  select count(*) into owner_count
  from public.admin_members
  where role = 'owner' and is_active = true and user_id <> p_user_id;

  if owner_count = 0 and (p_role <> 'owner' or p_is_active = false) then
    raise exception 'At least one active owner must remain.';
  end if;

  update public.admin_members
  set role = p_role, is_active = p_is_active
  where user_id = p_user_id;

  if not found then
    raise exception 'That administrator does not exist.';
  end if;
end;
$$;

comment on function public.update_admin_member(uuid, text, boolean) is
  'Owner-only: changes an administrator role or active state. Refuses to demote/deactivate yourself or remove the last active owner.';

revoke all on function public.list_admin_members() from public;
revoke all on function public.list_admin_members() from anon;
grant execute on function public.list_admin_members() to authenticated;

revoke all on function public.add_admin_member(text, text) from public;
revoke all on function public.add_admin_member(text, text) from anon;
grant execute on function public.add_admin_member(text, text) to authenticated;

revoke all on function public.update_admin_member(uuid, text, boolean) from public;
revoke all on function public.update_admin_member(uuid, text, boolean) from anon;
grant execute on function public.update_admin_member(uuid, text, boolean) to authenticated;

commit;
