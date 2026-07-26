-- User profile name parts + gender (aligned with clients registration).
-- `name` remains the display string, auto-built from first_name + middle_name + surname.

alter table public.users
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists surname text,
  add column if not exists gender text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_gender_check'
  ) then
    alter table public.users
      add constraint users_gender_check
      check (gender is null or gender in ('M', 'F'));
  end if;
end $$;

comment on column public.users.name is
  'Display name auto-built from first_name + middle_name + surname.';

-- Backfill name parts from existing display name (only where first_name is empty).
update public.users u
set
  first_name = case
    when array_length(s.parts, 1) >= 1 then s.parts[1]
    else null
  end,
  middle_name = case
    when array_length(s.parts, 1) >= 3 then array_to_string(s.parts[2 : array_length(s.parts, 1) - 1], ' ')
    else null
  end,
  surname = case
    when array_length(s.parts, 1) >= 2 then s.parts[array_length(s.parts, 1)]
    else null
  end
from (
  select
    id,
    regexp_split_to_array(trim(name), '\s+') as parts
  from public.users
  where name is not null
    and trim(name) <> ''
    and coalesce(nullif(trim(first_name), ''), '') = ''
) s
where u.id = s.id;

-- Seed gender for demo accounts (optional).
update public.users
set gender = 'M'
where id in (
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002'
)
and gender is null;

update public.users
set gender = 'F'
where id = 'b0000000-0000-4000-8000-000000000003'
and gender is null;
