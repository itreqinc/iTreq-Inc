-- Phase 6 auth: users, OTP codes, sessions.
-- Edge Function `auth` uses the service role; anon has no direct table access.

create table public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  password_hash text,
  role text not null check (role in ('client', 'staff', 'admin')),
  client_id uuid references public.clients (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_or_phone check (email is not null or phone is not null),
  constraint users_client_role_link check (
    (role = 'client' and client_id is not null)
    or (role in ('staff', 'admin') and client_id is null)
  )
);

create unique index users_email_unique_idx on public.users (lower(email))
  where email is not null;
create unique index users_phone_unique_idx on public.users (phone)
  where phone is not null;
create index users_client_id_idx on public.users (client_id);
create index users_role_idx on public.users (role);

create table public.auth_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  destination text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_otps_user_idx on public.auth_otps (user_id);
create index auth_otps_destination_idx on public.auth_otps (destination);

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index auth_sessions_user_idx on public.auth_sessions (user_id);
create index auth_sessions_expires_idx on public.auth_sessions (expires_at);

alter table public.users enable row level security;
alter table public.auth_otps enable row level security;
alter table public.auth_sessions enable row level security;

-- No anon/authenticated policies: only service role (Edge) may access.

-- Demo client for portal login testing
insert into public.clients (id, name, email, phone, notes)
values (
  'a0000000-0000-4000-8000-000000000001',
  'Demo Portal Client',
  'client@demo.local',
  '+26770000003',
  'Seeded for auth / portal login testing'
)
on conflict (id) do nothing;

-- password123 → pbkdf2$100000$salt$hash (Web Crypto compatible)
-- pbkdf2$100000$dcf83c9552bf9912f2860b38c97048ca$d6956ce7088eca20ee86333a47e92801c62c22311386ced5b89db34d93b4ddff
insert into public.users (id, name, email, phone, password_hash, role, client_id) values
  (
    'b0000000-0000-4000-8000-000000000001',
    'Demo Admin',
    'admin@itreq.local',
    '+26770000001',
    'pbkdf2$100000$dcf83c9552bf9912f2860b38c97048ca$d6956ce7088eca20ee86333a47e92801c62c22311386ced5b89db34d93b4ddff',
    'admin',
    null
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'Demo Staff',
    'staff@itreq.local',
    '+26770000002',
    'pbkdf2$100000$dcf83c9552bf9912f2860b38c97048ca$d6956ce7088eca20ee86333a47e92801c62c22311386ced5b89db34d93b4ddff',
    'staff',
    null
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'Demo Client User',
    'client@demo.local',
    '+26770000003',
    'pbkdf2$100000$dcf83c9552bf9912f2860b38c97048ca$d6956ce7088eca20ee86333a47e92801c62c22311386ced5b89db34d93b4ddff',
    'client',
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000000-0000-4000-8000-000000000004',
    'OTP-only Client',
    'otp-client@demo.local',
    '+26770000004',
    null,
    'client',
    'a0000000-0000-4000-8000-000000000001'
  )
on conflict (id) do nothing;
