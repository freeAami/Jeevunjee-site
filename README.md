# Jeevunjee Family Scholarship — site

React 19 + Vite + TypeScript site for the Jeevunjee Family Scholarship.

**Live:** https://freeaami.github.io/Jeevunjee-site/

```bash
npm install
npm run dev       # local dev server
npm run build     # typecheck + production build → dist/
```

Configuration lives in `.env.local` (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_SUBMIT_ENDPOINT` | The committee's Google Apps Script web-app URL ([setup](apps-script/SETUP.md)). **Empty = preview mode: nothing is sent**, and the confirmation screen says so. |
| `VITE_COMMITTEE_URL` | The applications Google Sheet. Powers the footer's "Committee access" link. |
| `VITE_HERO_VIDEO`, `VITE_APPLY_VIDEO` | Background video URLs. Point them at self-hosted copies before launch. |

## Layout

- `src/content.ts`: all section copy (steps, pillars, family bios, contact email)
- `src/components/`: nav, hero (with the fade-in/fade-out manual video loop), sections, ambient layers
- `src/journey/`: the eight-question application journey
- `src/lib/application.ts`: answer model, on-device draft, photo shrinking, submission
- `apps-script/`: the committee inbox (Google Sheet + Drive + email) and its setup guide
- `src/styles/theme.css`: design tokens, motion system, responsive rules

See `ASSESSMENT.md` for launch readiness.

## Deploying

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
The committee's Apps Script link and sheet link are built in (`src/lib/application.ts`, `src/content.ts`).
If you redeploy the script as a *new* deployment its URL changes — update it there. (Editing the existing
deployment with "New version" keeps the same URL.)
