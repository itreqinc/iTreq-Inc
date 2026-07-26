-- Portal invite tracking, dual-role staff, after-hours delegation.

-- Allow staff/admin to optionally link a client_id (dual-role).
alter table public.users drop constraint if exists users_client_role_link;

alter table public.users
  add constraint users_client_role_link check (
    (role = 'client' and client_id is not null)
    or (role in ('staff', 'admin'))
  );

alter table public.users
  add column if not exists invited_at timestamptz,
  add column if not exists first_login_at timestamptz,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists after_hours_until timestamptz;

-- One primary portal login (role=client) per client.
-- Remove conflicting seed (OTP-only shared the demo client_id).
delete from public.users
where id = 'b0000000-0000-4000-8000-000000000004';

create unique index if not exists users_one_client_role_per_client_idx
  on public.users (client_id)
  where role = 'client' and client_id is not null;

-- Seed dual-role staff linked to demo client (for toggle testing).
update public.users
set
  client_id = 'a0000000-0000-4000-8000-000000000001',
  updated_at = now()
where id = 'b0000000-0000-4000-8000-000000000002'
  and role = 'staff';
