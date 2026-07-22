begin;

do $$
begin
  if to_regclass('public.admin_members') is null then
    raise exception 'Missing required table public.admin_members. Run 20260712001_admin_members.sql before this migration.';
  end if;
end;
$$;

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

create table if not exists public.tool_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tool_categories_slug_check check (slug ~ '^[a-z0-9-]+$')
);

create table if not exists public.pdf_tools (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  category_id uuid references public.tool_categories(id) on delete set null,
  name text not null,
  short_description text not null,
  route text unique not null,
  icon_key text not null,
  status text not null default 'active',
  is_enabled boolean not null default true,
  is_homepage_eligible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pdf_tools_slug_check check (slug ~ '^[a-z0-9-]+$'),
  constraint pdf_tools_route_check check (route like '/%'),
  constraint pdf_tools_status_check check (status in ('active', 'beta', 'coming_soon', 'hidden', 'maintenance'))
);

create table if not exists public.homepage_tool_slots (
  slot_number smallint primary key,
  tool_id uuid unique references public.pdf_tools(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint homepage_tool_slots_slot_number_check check (slot_number between 1 and 5)
);

create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  name text not null,
  description text,
  is_enabled boolean not null default false,
  environment text not null default 'production',
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_check check (key ~ '^[a-z0-9-]+$'),
  constraint feature_flags_environment_check check (environment in ('production', 'preview', 'development', 'all'))
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  tone text not null default 'information',
  link_label text,
  link_url text,
  is_active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_tone_check check (tone in ('information', 'success', 'warning', 'maintenance')),
  constraint announcements_link_url_check check (link_url is null or link_url like '/%' or link_url like 'https://%'),
  constraint announcements_schedule_check check (starts_at is null or ends_at is null or ends_at >= starts_at)
);

create table if not exists public.seo_settings (
  route text primary key,
  title text not null,
  description text not null,
  canonical_path text,
  robots_index boolean not null default true,
  robots_follow boolean not null default true,
  open_graph_title text,
  open_graph_description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint seo_settings_route_check check (route like '/%'),
  constraint seo_settings_canonical_path_check check (canonical_path is null or canonical_path like '/%')
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  changes jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_role_check check (actor_role is null or actor_role in ('owner', 'admin', 'analyst'))
);

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  tool_slug text,
  anonymous_session_id uuid,
  occurred_at timestamptz not null default now(),
  duration_ms integer,
  input_size_bucket text,
  output_size_bucket text,
  device_class text,
  browser_family text,
  operating_system text,
  country_code text,
  success boolean,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  constraint analytics_events_input_size_bucket_check check (input_size_bucket is null or input_size_bucket in ('under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb', 'over_50mb', 'unknown')),
  constraint analytics_events_output_size_bucket_check check (output_size_bucket is null or output_size_bucket in ('under_1mb', '1mb_to_5mb', '5mb_to_20mb', '20mb_to_50mb', 'over_50mb', 'unknown')),
  constraint analytics_events_device_class_check check (device_class is null or device_class in ('desktop', 'tablet', 'mobile', 'unknown'))
);

create table if not exists public.daily_tool_metrics (
  metric_date date not null,
  tool_slug text not null,
  tool_opens bigint not null default 0,
  processing_started bigint not null default 0,
  processing_succeeded bigint not null default 0,
  processing_failed bigint not null default 0,
  total_duration_ms bigint not null default 0,
  primary key (metric_date, tool_slug)
);

comment on table public.tool_categories is 'Control Center catalog categories for public PDF tools.';
comment on table public.pdf_tools is 'Control Center catalog for Lumeo PDF tools. Does not store user files or document data.';
comment on table public.homepage_tool_slots is 'Five configurable homepage tool slots. The sixth All PDF Tools card is permanent and not stored.';
comment on table public.feature_flags is 'Operational feature flags with JSON configuration. No secrets are permitted.';
comment on table public.site_settings is 'Approved Control Center settings. Public settings are not automatically exposed by RLS.';
comment on table public.announcements is 'Public announcement records managed by administrators.';
comment on table public.seo_settings is 'Database foundation for route SEO records. Public metadata is not dynamic in this phase.';
comment on table public.audit_logs is 'Administrative audit history. Never store passwords, tokens, cookies, PDF data, filenames, contents, IP addresses, or secrets.';
comment on table public.analytics_events is 'Privacy-preserving analytics event foundation. No raw IPs, filenames, exact file sizes, document text, thumbnails, passwords, or metadata.';
comment on table public.daily_tool_metrics is 'Aggregated daily tool metrics for Control Center reporting.';

create index if not exists pdf_tools_category_id_idx on public.pdf_tools(category_id);
create index if not exists pdf_tools_status_idx on public.pdf_tools(status);
create index if not exists pdf_tools_is_enabled_idx on public.pdf_tools(is_enabled);
create index if not exists feature_flags_key_environment_idx on public.feature_flags(key, environment);
create index if not exists announcements_active_range_idx on public.announcements(is_active, starts_at, ends_at);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_actor_user_id_idx on public.audit_logs(actor_user_id);
create index if not exists audit_logs_entity_type_idx on public.audit_logs(entity_type);
create index if not exists analytics_events_occurred_at_idx on public.analytics_events(occurred_at desc);
create index if not exists analytics_events_event_name_idx on public.analytics_events(event_name);
create index if not exists analytics_events_tool_slug_idx on public.analytics_events(tool_slug);
create index if not exists daily_tool_metrics_metric_date_idx on public.daily_tool_metrics(metric_date desc);

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select am.role
  from public.admin_members am
  where am.user_id = auth.uid()
    and am.is_active = true
    and am.role in ('owner', 'admin', 'analyst')
  limit 1
$$;

comment on function public.current_admin_role() is
  'Returns the active administrator role for auth.uid(), or null. Used by Control Center RLS policies.';

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_admin_role() is not null
$$;

create or replace function public.can_manage_content()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_admin_role() in ('owner', 'admin')
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_admin_role() = 'owner'
$$;

create or replace function public.write_audit_log(
  action text,
  entity_type text,
  entity_id text,
  summary text,
  changes jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  active_role text;
  inserted_id bigint;
begin
  active_role := public.current_admin_role();

  if active_role is null then
    raise exception 'active admin required';
  end if;

  if nullif(btrim(action), '') is null or nullif(btrim(entity_type), '') is null or nullif(btrim(summary), '') is null then
    raise exception 'audit action, entity_type, and summary are required';
  end if;

  if length(action) > 120 or length(entity_type) > 80 or length(coalesce(entity_id, '')) > 120 or length(summary) > 500 then
    raise exception 'audit value too long';
  end if;

  if changes is not null and pg_column_size(changes) > 8192 then
    raise exception 'audit changes payload too large';
  end if;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    changes
  )
  values (
    auth.uid(),
    active_role,
    btrim(action),
    btrim(entity_type),
    nullif(btrim(entity_id), ''),
    btrim(summary),
    changes
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

comment on function public.write_audit_log(text, text, text, text, jsonb) is
  'Controlled audit insertion for active admins. Actor identity is derived from auth.uid() and never accepted from the caller.';

drop trigger if exists set_tool_categories_updated_at on public.tool_categories;
create trigger set_tool_categories_updated_at before update on public.tool_categories for each row execute function public.set_updated_at();
drop trigger if exists set_pdf_tools_updated_at on public.pdf_tools;
create trigger set_pdf_tools_updated_at before update on public.pdf_tools for each row execute function public.set_updated_at();
drop trigger if exists set_feature_flags_updated_at on public.feature_flags;
create trigger set_feature_flags_updated_at before update on public.feature_flags for each row execute function public.set_updated_at();
drop trigger if exists set_announcements_updated_at on public.announcements;
create trigger set_announcements_updated_at before update on public.announcements for each row execute function public.set_updated_at();
drop trigger if exists set_seo_settings_updated_at on public.seo_settings;
create trigger set_seo_settings_updated_at before update on public.seo_settings for each row execute function public.set_updated_at();

alter table public.tool_categories enable row level security;
alter table public.pdf_tools enable row level security;
alter table public.homepage_tool_slots enable row level security;
alter table public.feature_flags enable row level security;
alter table public.site_settings enable row level security;
alter table public.announcements enable row level security;
alter table public.seo_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.analytics_events enable row level security;
alter table public.daily_tool_metrics enable row level security;

drop policy if exists "Admins can read tool categories" on public.tool_categories;
create policy "Admins can read tool categories" on public.tool_categories for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage tool categories" on public.tool_categories;
create policy "Content admins can manage tool categories" on public.tool_categories for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read pdf tools" on public.pdf_tools;
create policy "Admins can read pdf tools" on public.pdf_tools for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage pdf tools" on public.pdf_tools;
create policy "Content admins can manage pdf tools" on public.pdf_tools for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read homepage slots" on public.homepage_tool_slots;
create policy "Admins can read homepage slots" on public.homepage_tool_slots for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage homepage slots" on public.homepage_tool_slots;
create policy "Content admins can manage homepage slots" on public.homepage_tool_slots for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read feature flags" on public.feature_flags;
create policy "Admins can read feature flags" on public.feature_flags for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage feature flags" on public.feature_flags;
create policy "Content admins can manage feature flags" on public.feature_flags for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read site settings" on public.site_settings;
create policy "Admins can read site settings" on public.site_settings for select to authenticated using (public.is_active_admin());
drop policy if exists "Owners can manage site settings" on public.site_settings;
create policy "Owners can manage site settings" on public.site_settings for all to authenticated using (public.is_owner()) with check (public.is_owner());

drop policy if exists "Admins can read announcements" on public.announcements;
create policy "Admins can read announcements" on public.announcements for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage announcements" on public.announcements;
create policy "Content admins can manage announcements" on public.announcements for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read seo settings" on public.seo_settings;
create policy "Admins can read seo settings" on public.seo_settings for select to authenticated using (public.is_active_admin());
drop policy if exists "Content admins can manage seo settings" on public.seo_settings;
create policy "Content admins can manage seo settings" on public.seo_settings for all to authenticated using (public.can_manage_content()) with check (public.can_manage_content());

drop policy if exists "Admins can read audit logs" on public.audit_logs;
create policy "Admins can read audit logs" on public.audit_logs for select to authenticated using (public.is_active_admin());

drop policy if exists "Admins can read analytics events" on public.analytics_events;

drop policy if exists "Admins can read daily tool metrics" on public.daily_tool_metrics;
create policy "Admins can read daily tool metrics" on public.daily_tool_metrics for select to authenticated using (public.is_active_admin());

revoke all on table public.tool_categories from anon;
revoke all on table public.pdf_tools from anon;
revoke all on table public.homepage_tool_slots from anon;
revoke all on table public.feature_flags from anon;
revoke all on table public.site_settings from anon;
revoke all on table public.announcements from anon;
revoke all on table public.seo_settings from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.analytics_events from anon;
revoke all on table public.daily_tool_metrics from anon;

revoke all on table public.tool_categories from authenticated;
revoke all on table public.pdf_tools from authenticated;
revoke all on table public.homepage_tool_slots from authenticated;
revoke all on table public.feature_flags from authenticated;
revoke all on table public.site_settings from authenticated;
revoke all on table public.announcements from authenticated;
revoke all on table public.seo_settings from authenticated;
revoke all on table public.audit_logs from authenticated;
revoke all on table public.analytics_events from authenticated;
revoke all on table public.daily_tool_metrics from authenticated;

grant select, insert, update, delete on table public.tool_categories to authenticated;
grant select, insert, update, delete on table public.pdf_tools to authenticated;
grant select, insert, update, delete on table public.homepage_tool_slots to authenticated;
grant select, insert, update, delete on table public.feature_flags to authenticated;
grant select, insert, update, delete on table public.announcements to authenticated;
grant select, insert, update, delete on table public.seo_settings to authenticated;
grant select, insert, update, delete on table public.site_settings to authenticated;
grant select on table public.audit_logs to authenticated;
grant select on table public.daily_tool_metrics to authenticated;

revoke all on sequence public.audit_logs_id_seq from anon;
revoke all on sequence public.audit_logs_id_seq from authenticated;
revoke all on sequence public.analytics_events_id_seq from anon;
revoke all on sequence public.analytics_events_id_seq from authenticated;

revoke all on function public.set_updated_at() from public;
revoke all on function public.current_admin_role() from public;
revoke all on function public.is_active_admin() from public;
revoke all on function public.can_manage_content() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.write_audit_log(text, text, text, text, jsonb) from public;

grant execute on function public.current_admin_role() to authenticated;
grant execute on function public.is_active_admin() to authenticated;
grant execute on function public.can_manage_content() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.write_audit_log(text, text, text, text, jsonb) to authenticated;

insert into public.tool_categories (slug, name, description, sort_order)
values
  ('organize-pdf', 'Organize PDF', 'Arrange, merge, split, and prepare document structure.', 10),
  ('optimize-pdf', 'Optimize PDF', 'Reduce weight and prepare files for sharing.', 20),
  ('convert-to-pdf', 'Convert to PDF', 'Turn source files into polished PDFs.', 30),
  ('convert-from-pdf', 'Convert from PDF', 'Export PDF pages into practical formats.', 40)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.pdf_tools (slug, category_id, name, short_description, route, icon_key, status, is_enabled, is_homepage_eligible, sort_order)
values
  ('merge', (select id from public.tool_categories where slug = 'organize-pdf'), 'Merge PDF', 'Combine PDFs into one clean document.', '/pdf/merge', 'merge', 'active', true, true, 10),
  ('split', (select id from public.tool_categories where slug = 'organize-pdf'), 'Split PDF', 'Extract pages or separate one PDF.', '/pdf/split', 'split', 'active', true, true, 20),
  ('compress', (select id from public.tool_categories where slug = 'optimize-pdf'), 'Compress PDF', 'Reduce PDF size carefully.', '/pdf/compress', 'compress', 'active', true, true, 30),
  ('jpg-to-pdf', (select id from public.tool_categories where slug = 'convert-to-pdf'), 'JPG to PDF', 'Turn images into a polished PDF.', '/pdf/jpg-to-pdf', 'image-to-pdf', 'coming_soon', true, true, 40),
  ('pdf-to-jpg', (select id from public.tool_categories where slug = 'convert-from-pdf'), 'PDF to JPG', 'Export PDF pages as images.', '/pdf/pdf-to-jpg', 'pdf-to-image', 'coming_soon', true, true, 50)
on conflict (slug) do update
set category_id = excluded.category_id,
    name = excluded.name,
    short_description = excluded.short_description,
    route = excluded.route,
    icon_key = excluded.icon_key,
    status = excluded.status,
    is_enabled = excluded.is_enabled,
    is_homepage_eligible = excluded.is_homepage_eligible,
    sort_order = excluded.sort_order;

insert into public.homepage_tool_slots (slot_number, tool_id)
values
  (1, (select id from public.pdf_tools where slug = 'merge')),
  (2, (select id from public.pdf_tools where slug = 'split')),
  (3, (select id from public.pdf_tools where slug = 'compress')),
  (4, (select id from public.pdf_tools where slug = 'jpg-to-pdf')),
  (5, (select id from public.pdf_tools where slug = 'pdf-to-jpg'))
on conflict (slot_number) do update
set tool_id = excluded.tool_id,
    updated_at = now();

commit;
