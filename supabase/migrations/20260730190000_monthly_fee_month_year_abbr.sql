-- Prefer Mon YYYY in fee line descriptions (e.g. Aug 2026).
-- Safe to re-run if 20260730180000 already applied with Mon-only labels.

create or replace function public.replace_line_month_abbr(
  p_description text,
  p_period date
)
returns text
language plpgsql
immutable
as $$
declare
  v_abbr text := to_char(public.month_start(p_period), 'Mon YYYY');
  v_desc text := coalesce(p_description, '');
begin
  if v_desc ~* '\(\s*monthly\s*\)\s*$' then
    return regexp_replace(v_desc, '\(\s*monthly\s*\)\s*$', '(' || v_abbr || ')', 'i');
  end if;

  return regexp_replace(
    v_desc,
    '\(\s*(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)(\s+\d{4})?\s*\)\s*$',
    '(' || v_abbr || ')',
    'i'
  );
end;
$$;

comment on function public.replace_line_month_abbr(text, date) is
  'Replace a trailing (month) or (monthly) in an invoice line description with Mon YYYY for p_period (e.g. Aug 2026).';
