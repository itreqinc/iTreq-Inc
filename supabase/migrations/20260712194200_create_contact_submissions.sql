-- Contact / quote form leads (public insert via anon key + RLS).

create table public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  interest text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_submissions enable row level security;

create policy "Allow public insert on contact_submissions"
  on public.contact_submissions
  for insert
  to anon
  with check (true);
