# iTreq Inc Website

Public brochure website for iTreq Inc — GPS tracking solutions for vehicles, assets, fleets and recovery support.

## Stack

- React + Vite
- Tailwind CSS v4
- React Router
- Supabase (contact form leads)

## Run locally

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (usually http://localhost:5173).

## Supabase (anon key)

The contact form saves leads to Supabase using the **anon (public)** key. That key is safe in the browser only because Row Level Security (RLS) limits what it can do.

### 1. Get your keys

In the Supabase dashboard → your project → **Project Settings** → **API**:

| Value | Env var | Use in frontend? |
|--------|---------|------------------|
| Project URL | `VITE_SUPABASE_URL` | Yes |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` | Yes |
| `service_role` key | — | **Never** — bypasses RLS |

### 2. Add a local env file

```bash
cp .env.example .env.local
```

Paste your real anon key into `.env.local`. Restart `npm run dev` after changing env vars.

On Vercel, add the same two `VITE_*` variables in Project Settings → Environment Variables.

### 3. Push the leads table migration

```bash
npx supabase login
npx supabase link --project-ref gtsjiqbohbgzwqfqkgyr
npx supabase db push
```

That applies `supabase/migrations/20260712194200_create_contact_submissions.sql` — `contact_submissions` with an **insert-only** anon policy. View leads in **Table Editor**.

### 4. How the app uses it

```js
import { supabase } from './lib/supabase'

await supabase.from('contact_submissions').insert({ name, email, phone, interest, message })
```

`src/lib/supabase.js` creates one shared client from the Vite env vars. Later features (CMS stories, admin UI) reuse the same client and add new tables + RLS policies.

## Pages

- `/` — Home
- `/services` — Services
- `/what-we-track` — What We Track
- `/success-stories` — Success Stories
- `/about` — About
- `/contact` — Contact / quote form (writes to Supabase)

## Branding & contact details

Edit placeholder business details in `src/data/site.js` (phone, email, WhatsApp, Facebook, hours).

When you have the official logo, place it at `public/logo.png` (or replace that file). The favicon uses `public/favicon.png`.

Brand colors are pulled from the logo:
- Azure/blue `#2080D0` — “iTreq”, labels, secondary accents
- Lime green `#6DC03F` — “Inc”, primary buttons, highlights
