begin;

do $$
begin
  if to_regclass('public.seo_settings') is null then
    raise exception 'Missing required table public.seo_settings. Run 20260712002_control_center_foundation.sql before 20260719019_public_seo_settings.sql.';
  end if;
end;
$$;

-- Wires up seo_settings (previously admin-only, "public page metadata
-- remains static in this phase") to an actual public read path. Returns
-- one route's record if configured, or null so callers fall back to their
-- static defaults. No updated_by or updated_at is exposed.
create or replace function public.get_public_seo_setting(p_route text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'title', seo_settings.title,
    'description', seo_settings.description,
    'canonical_path', seo_settings.canonical_path,
    'robots_index', seo_settings.robots_index,
    'robots_follow', seo_settings.robots_follow,
    'open_graph_title', seo_settings.open_graph_title,
    'open_graph_description', seo_settings.open_graph_description
  )
  from public.seo_settings
  where seo_settings.route = p_route
  limit 1;
$$;

comment on function public.get_public_seo_setting(text) is
  'Public read of one route''s SEO record, or null if unconfigured. No updated_by/updated_at exposed.';

revoke all on function public.get_public_seo_setting(text) from public;
grant execute on function public.get_public_seo_setting(text) to anon;
grant execute on function public.get_public_seo_setting(text) to authenticated;

commit;
