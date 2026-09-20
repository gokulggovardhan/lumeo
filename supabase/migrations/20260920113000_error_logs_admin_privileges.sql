begin;

-- error_logs is never a public table API. Anonymous/client error capture goes
-- only through the SECURITY DEFINER record_error_event(...) RPC. Admin pages
-- read rows with the authenticated user's session and content admins update
-- status through RLS-protected actions.
--
-- Supabase environments can differ in their default table grants. Declare the
-- application contract explicitly so a clean local database and production
-- enforce the same least-privilege boundary.
revoke all on table public.error_logs from anon;
revoke all on table public.error_logs from authenticated;

grant select, update on table public.error_logs to authenticated;

commit;
