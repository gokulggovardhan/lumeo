begin;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise exception 'Missing required table public.audit_logs. Run 20260712_002_control_center_foundation.sql before 20260719_012_audit_log_actor_emails.sql.';
  end if;
end;
$$;

-- Resolves audit-log actor_user_id values to email addresses, so the Audit
-- Log page can show "owner@example.com" instead of a raw UUID. Scoped to any
-- active admin (matches canViewAudit: owner/admin/analyst), and only ever
-- resolves ids that are (or were) in admin_members -- never an arbitrary
-- auth.users id, even though the caller could technically pass any uuid.
create or replace function public.resolve_admin_emails(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_active_admin() then
    raise exception 'Active administrator access required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object('user_id', users.id, 'email', users.email))
      from auth.users as users
      where users.id = any(p_user_ids)
        and exists (select 1 from public.admin_members as members where members.user_id = users.id)
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.resolve_admin_emails(uuid[]) is
  'Any active admin: resolves a list of user ids to email addresses, restricted to ids that are or were administrators. Used to show actor emails on the Audit Log page.';

revoke all on function public.resolve_admin_emails(uuid[]) from public;
revoke all on function public.resolve_admin_emails(uuid[]) from anon;
grant execute on function public.resolve_admin_emails(uuid[]) to authenticated;

commit;
