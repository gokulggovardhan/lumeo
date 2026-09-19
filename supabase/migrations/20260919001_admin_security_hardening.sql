begin;

-- Internal authorization helpers are intentionally callable by authenticated
-- application users because RLS/admin RPCs depend on them. They do not need
-- to be directly callable by anonymous API clients.
revoke execute on function public.current_admin_role() from anon;
revoke execute on function public.is_active_admin() from anon;
revoke execute on function public.is_owner() from anon;
revoke execute on function public.can_manage_content() from anon;
revoke execute on function public.refresh_daily_tool_metrics(date) from anon;
revoke execute on function public.write_audit_log(text, text, text, text, jsonb) from anon;

-- Make the self-membership policy evaluate auth.uid() once per statement
-- rather than once per candidate row.
drop policy if exists "Admin members can read their own membership" on public.admin_members;
create policy "Admin members can read their own membership"
  on public.admin_members
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

commit;
