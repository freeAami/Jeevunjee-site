# Jeevunjee Family Scholarship — site

React 19 + Vite + TypeScript site for the Jeevunjee Family Scholarship, with a trustee & student portal.

- **Public site + application journey**: `/` — applicants answer the Trust's application form one screen at a time.
- **Portal**: `/#/portal`. Trustees see every student's profile, course, payment schedule (LKR + foreign currency,
  with the exchange rate locked per payment), documents and notes. Students sign in with a one-time access code
  to see their own schedule and upload invoices and results.

**Live:** https://freeaami.github.io/Jeevunjee-site/

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build → dist/
```

Configuration lives in `.env.local` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The portal database ([setup](supabase/SETUP.md)). Empty = the portal runs in **preview mode** on fictional data, and applications go to the Google Sheet instead. |
| `VITE_SUBMIT_ENDPOINT` | The committee's Google Apps Script ([setup](apps-script/SETUP.md)). It emails the trustees about each application, and receives applications itself while Supabase isn't connected. Defaults to the Trust's script; set it to empty for a fully offline preview. |
| `VITE_HERO_VIDEO`, `VITE_APPLY_VIDEO` | Background video URLs. Point them at self-hosted copies before launch. |

## Layout

- `src/content.ts`: all section copy (steps, pillars, family bios, contact email)
- `src/components/`: nav, hero (with the fade-in/fade-out manual video loop), sections, ambient layers
- `src/journey/`: the application journey (10 screens in 5 stages, mirroring the Trust's paper form)
- `src/lib/application.ts`: answer model, on-device draft, submission (Supabase, or the Sheet as fallback)
- `src/portal/`: the trustee & student portal: `api.ts` (Supabase), `demo.ts` (preview data), `admin/` screens
- `supabase/schema.sql`: tables, security rules, sign-up rules and storage; `supabase/tests/` proves the rules
- `apps-script/`: the committee inbox (Google Sheet + Drive + email) and its setup guide
- `src/styles/theme.css`: design tokens, motion system, responsive rules

See `ASSESSMENT.md` for launch readiness.

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
The committee's Apps Script link and sheet link are built in (`src/lib/application.ts`, `src/content.ts`).
If you redeploy the script as a *new* deployment its URL changes — update it there. (Editing the existing
deployment with "New version" keeps the same URL.)
