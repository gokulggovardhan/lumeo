begin;

do $$
begin
  if to_regclass('public.announcements') is null then
    raise exception 'Missing required table public.announcements. Run 20260712002_control_center_foundation.sql before 20260719018_public_announcements.sql.';
  end if;
end;
$$;

-- Wires up the announcements table (previously admin-only, "no public
-- rendering in this phase") to an actual public read path. Only active
-- announcements currently within their optional start/end window are
-- returned, and only the fields safe to show publicly -- no id, no
-- created_by/updated_by, no internal timestamps.
create or replace function public.get_public_announcements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', announcements.title,
        'message', announcements.message,
        'tone', announcements.tone,
        'link_label', announcements.link_label,
        'link_url', announcements.link_url
      )
      order by announcements.starts_at desc nulls last, announcements.created_at desc
    ),
    '[]'::jsonb
  )
  from public.announcements
  where announcements.is_active = true
    and (announcements.starts_at is null or announcements.starts_at <= now())
    and (announcements.ends_at is null or announcements.ends_at >= now());
$$;

comment on function public.get_public_announcements() is
  'Public read of currently-active, in-window announcements only (title/message/tone/link). No id, author, or timestamp columns are exposed.';

revoke all on function public.get_public_announcements() from public;
grant execute on function public.get_public_announcements() to anon;
grant execute on function public.get_public_announcements() to authenticated;

commit;
