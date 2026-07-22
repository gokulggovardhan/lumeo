begin;

do $$
begin
  if to_regclass('public.site_settings') is null then
    raise exception 'Missing required table public.site_settings. Run 20260712002_control_center_foundation.sql before 20260719010_public_maintenance_mode.sql.';
  end if;
end;
$$;

-- Wires up the "maintenance_mode" site_settings row (already editable in the
-- admin Settings page, previously "stored only, no public behavior") to an
-- actual public read path. Value shape: {"enabled": boolean, "title": text,
-- "message": text}. Only this one setting is exposed, and only when
-- is_public is also true (defense in depth) -- never the whole table.
create or replace function public.get_public_maintenance_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'enabled', coalesce((site_settings.value->>'enabled')::boolean, false),
        'title', nullif(site_settings.value->>'title', ''),
        'message', nullif(site_settings.value->>'message', '')
      )
      from public.site_settings
      where site_settings.key = 'maintenance_mode'
        and site_settings.is_public = true
      limit 1
    ),
    jsonb_build_object('enabled', false, 'title', null, 'message', null)
  );
$$;

comment on function public.get_public_maintenance_status() is
  'Public read of the maintenance_mode site setting only (enabled/title/message), gated on is_public. No other site_settings rows or columns are exposed.';

revoke all on function public.get_public_maintenance_status() from public;
grant execute on function public.get_public_maintenance_status() to anon;
grant execute on function public.get_public_maintenance_status() to authenticated;

-- Seed the row if it doesn't exist yet, defaulting to off and public so the
-- toggle works the first time an owner flips it without an extra "make it
-- public" step (is_public was previously an admin-only display flag with no
-- functional effect; now it's the gate for the public RPC above).
insert into public.site_settings (key, value, description, is_public)
values (
  'maintenance_mode',
  jsonb_build_object('enabled', false, 'title', null, 'message', null),
  'Site-wide maintenance mode. When enabled, all public routes show the maintenance page; /admin stays reachable.',
  true
)
on conflict (key) do nothing;

commit;
