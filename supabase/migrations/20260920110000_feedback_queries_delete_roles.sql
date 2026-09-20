begin;

do $$
begin
  if to_regprocedure('public.can_manage_content()') is null then
    raise exception 'Missing required function public.can_manage_content().';
  end if;
end;
$$;

-- Analysts may view Inbox messages and mark them read, but deletion is a
-- content-management action exposed only to owner/admin roles in the Control
-- Center. Enforce that same boundary in RLS so hiding the Delete button is not
-- the only protection.
drop policy if exists "Admins can delete feedback and queries" on public.feedback_queries;
create policy "Content admins can delete feedback and queries"
on public.feedback_queries
for delete
to authenticated
using (public.can_manage_content());

commit;
