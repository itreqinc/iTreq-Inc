-- Track last validate_session (activity) for idle logout.
alter table public.auth_sessions
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists auth_sessions_last_activity_idx
  on public.auth_sessions (last_activity_at);
