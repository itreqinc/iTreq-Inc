# Payroll cron (Africa/Gaborone)

Set secret `PAYROLL_CRON_SECRET` on the payroll Edge Function (same value in GitHub Secrets).

## Times

| Local (Gaborone) | UTC | Action |
| --- | --- | --- |
| 07:00 | 05:00 | `payday_morning_reminder` |
| 23:59 | 21:59 | `auto_post_pay_run_if_due` |

Scheduled by [`.github/workflows/payroll-cron.yml`](../../../.github/workflows/payroll-cron.yml).

## GitHub secrets (repo → Settings → Secrets and variables → Actions)

- `SUPABASE_URL` — `https://gtsjiqbohbgzwqfqkgyr.supabase.co`
- `SUPABASE_ANON_KEY` — Project Settings → API → anon public
- `PAYROLL_CRON_SECRET` — same password you set with `npx supabase secrets set`

## Manual test

Actions → **Payroll cron** → **Run workflow** → pick reminder or auto-post.
