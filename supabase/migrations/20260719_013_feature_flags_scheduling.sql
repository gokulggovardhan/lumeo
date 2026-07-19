begin;

do $$
begin
  if to_regclass('public.feature_flags') is null then
    raise exception 'Missing required table public.feature_flags. Run 20260712_002_control_center_foundation.sql before 20260719_013_feature_flags_scheduling.sql.';
  end if;
end;
$$;

-- Feature flags previously had only a blind JSON config textarea and a
-- manual on/off toggle -- rollout percentage and scheduling were things an
-- admin would have to encode into that JSON by convention, with nothing
-- validating the shape. These become real, validated columns instead.
alter table public.feature_flags
  add column if not exists rollout_percentage smallint not null default 100,
  add column if not exists activate_at timestamptz,
  add column if not exists deactivate_at timestamptz;

alter table public.feature_flags
  drop constraint if exists feature_flags_rollout_percentage_check;
alter table public.feature_flags
  add constraint feature_flags_rollout_percentage_check check (rollout_percentage between 0 and 100);

alter table public.feature_flags
  drop constraint if exists feature_flags_schedule_check;
alter table public.feature_flags
  add constraint feature_flags_schedule_check check (activate_at is null or deactivate_at is null or deactivate_at > activate_at);

comment on column public.feature_flags.rollout_percentage is
  'Intended rollout percentage (0-100) once application code reads feature flags. Not yet enforced anywhere -- config is stored, no public behavior changes from this column alone.';
comment on column public.feature_flags.activate_at is
  'Optional scheduled activation time, shown in the admin UI as "Scheduled" ahead of this time. Informational only until a consumer reads it.';
comment on column public.feature_flags.deactivate_at is
  'Optional scheduled deactivation time, shown in the admin UI as "Expired" after this time. Informational only until a consumer reads it.';

commit;
