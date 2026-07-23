-- Replace title usage with gender/sex (M | F). title column may remain unused.

alter table public.clients
  add column if not exists gender text
    check (gender is null or gender in ('M', 'F'));
