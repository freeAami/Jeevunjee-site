# Jeevunjee Scholarship: session handoff (checkpoint, 8 Oct 2026)

Read this first if you're picking the project up, whether you're a person or a coding agent. It covers where the
project started, what exists now, why it is built this way, what is unfinished, and how to keep working on it.

- **Repo:** https://github.com/freeAami/Jeevunjee-site (public). Branch `main`. Code checkpoint: `045bf1a` (security
  hardening); this document, the audit outputs and the tooling were committed after it.
- **Live today:** GitHub Pages at https://freeaami.github.io/Jeevunjee-site/. It auto-deploys from `main`, so the
  hardened code from `045bf1a` is already live there.
- **Planned host:** Vercel. It is configured (`vercel.json`) but has not been deployed yet, so there is no URL.
- **Owner:** Ammar (the person building it), for the Jeevunjee family's two trusts.

> ⚠️ **Urgent, first thing:** the site on GitHub Pages already runs the new code, but the Supabase database may
> still have the old rules. Until the owner re-runs `supabase/schema.sql` (step 1 below), **sending an application
> fails** (the site calls `submit_application` with a new third argument). Do step 1 before anything else.

---

## 1. Where we started

1. **Claude Design handoff.** The starting point was a mock-up, *"Cinematic Hero with Looping Video"*, of a
   scholarship landing page for the Jeevunjee family's scholarship committee in Sri Lanka. The goal was a calm,
   human site for applicants who may not be able to afford school, not a "sales" page. The original export is kept in
   [`docs/design/`](docs/design/), including the chat transcripts that explain the intent.
2. **Build and polish.** The site was rebuilt as React 19 + Vite + TypeScript: a hero with looping video, botanical
   ambient motion, a story section, the committee, and a one-question-per-screen application "journey". Promises
   the trust couldn't guarantee were removed ("decision in two weeks", "1–2 weeks", "deleted after 12 months",
   and so on).
3. **Committee inbox.** Applications went to a Google Sheet through Google Apps Script, with email to the two trustees
   (Altaf and Imran) and a confirmation email to the applicant.
4. **Old domain dropped.** `jeevunjee.com` and `committee@jeevunjee.lk` are no longer owned, so every reference was
   removed. The site is hosted without a custom domain.
5. **Trust portal.** The trustees then shared their real process: two trusts (Rukan Trust and Y A J Noorbhai Trust),
   a paper application form, a spreadsheet of supported students, and a call transcript. The ask was a system where
   each enrolled student has a profile the two trustees can open to see what's happening, log payments, store
   documents, and never mix up two students with the same name. Decisions made then:
   - **Supabase** as the backend.
   - **Trustees and students both log in.**
   - **Both trusts in one system.**
   - **No extras** for now.
6. **Supabase connected.** A one-command setup script (`supabase/setup.mjs`) set up project `qtigkjwqqkdtikqkvlgc`
   and imported the 7 existing students. The owner then deleted the Management API token.
7. **Hosting.** GitHub Pages works, but the owner wants Vercel ("GitHub doesn't work. Push with Vercel. Leave no
   domain for now."). The repo is ready for Vercel; the owner runs the deploy from their own machine.
8. **End-to-end security audit.** Before going further, the owner asked for a full audit ("this website under no
   circumstance be subject to any malicious attacks"). It was run with the Cloudflare security-audit skill in full
   mode. It found 9 issues and every one has a fix in `045bf1a` (section 5).

## 2. What exists now

### Public site (`src/`)
- `App.tsx` uses hash routing; `#/portal…` lazy-loads the portal. The site content is in `content.ts`, and the
  sections are in `components/`.
- `journey/` is the application (`Journey.tsx`, `fields.tsx`): 10 scenes in 5 stages that mirror the Trust's paper
  form. It covers personal details, photo, ID, education with certificates, work, ambitions, course, fees in LKR plus a
  foreign currency, payment plan, family situation, declarations and a typed signature. Drafts are saved on the device
  and expire after 14 days.
- `lib/application.ts` handles submission:
  1. Shrinks photos on the device.
  2. Uploads them to Supabase Storage `applications/incoming/<random uuid>/…`.
  3. Calls the `submit_application` RPC with a random 256-bit **notify token**.
  4. Pings the Apps Script with only `{reference, token}`.
- `lib/files.ts` has the file-type allowlist (JPEG, PNG, WebP, GIF, HEIC, HEIF, PDF; no SVG) and the shrinking code.

### Trustee and student portal (`src/portal/`)
- `api.ts` is the live Supabase API; `demo.ts` is a fictional in-browser version used when Supabase isn't
  configured (`npm run dev`), with "Preview as trustee/student" buttons.
- Trustee screens are in `admin/`:
  - **Overview:** totals, upcoming instalments.
  - **Students:** list and search, with a unique code `S-001` so same-name students are never confused.
  - **Student file:** profile, course, instalments, payments in LKR and foreign currency (the exchange rate is locked
    per payment), documents, private notes, and one-time student access codes.
  - **Applications:** review, status, notes, **Accept & create student file** (which fills the profile, course,
    payment plan and documents automatically), **Delete application & documents**, and **Remove unused uploads**.
- Students see only their own file and can upload invoices, results and receipts.

### Database (`supabase/schema.sql`, safe to re-run)
- **Tables:** `trusts`, `admin_emails`, `applications`, `students`, `profiles`, `courses`, `instalments`, `payments`,
  `documents`, `notes`.
- **Row-level security on everything.** Trustees (`is_admin()`) see and edit all of it. A student reads only their
  own rows (`my_student_id()`). The public can only call `submit_application` and upload into fresh folders.
- **Sign-up trigger `handle_new_user`.** It refuses every sign-up unless one of these holds:
  - **Trustee:** a listed email **and** its one-time trustee code (`issue_trustee_code(email)`, run in the SQL
    editor, valid 7 days, single use).
  - **Student:** a one-time access code issued by a trustee (valid 14 days, single use).
- **Main functions:**
  - `submit_application`: validates input, rate-limits to 15 per hour and 60 per day, and only accepts files that were
    really uploaded into one unused folder. File entries are rebuilt from known fields.
  - `claim_notification`: the Apps Script calls it; it hands an application over once, within an hour, with the token.
  - `application_upload_ok`: the upload policy (folder format, 30 files per folder, 150 per hour and 400 per day
    site-wide).
  - `enrol_application`, `issue_access_code`, `stale_application_uploads`.
  - The `forget_deleted_document` trigger, so deleted documents can't come back.
- **Storage:** two private buckets. `applications` holds applicant uploads; `files` holds `students/<id>/…`.
- **Tests:** `supabase/tests/run_security_tests.py` (105 checks, against a local Postgres plus the shim
  `supabase_shim.sql`).

### Apps Script inbox (`apps-script/Code.gs`)
- Lives inside the committee's Google Sheet. On each ping it calls `claim_notification`. It writes nothing unless the
  database confirms a real, fresh application. It then:
  - adds a Sheet row (formula-safe);
  - emails both trustees (at most 25 a day);
  - sends the applicant a confirmation (at most 20 a day).
- It stores no files, and its lock covers only the Sheet write.
- The repo copy has placeholder trustee emails. The owner's private ready-to-paste copy has the real ones.
- Tests: `node apps-script/tests/run_tests.cjs` (mocked Google services).

### Hosting and operations
- `vercel.json` sets the security headers: CSP, `frame-ancestors 'none'`, COOP, HSTS, nosniff, Referrer-Policy and
  Permissions-Policy. `tools/csp-check/` verifies that the CSP doesn't break the site.
- `.github/workflows/deploy.yml` is the GitHub Pages build (`VITE_BASE=/Jeevunjee-site/`), with permissions scoped per
  job. `keepalive.yml` pings Supabase twice a week so the free project doesn't pause.

## 3. Key facts and IDs (none of these are secret)

| Thing | Value |
|---|---|
| Supabase project | ref `qtigkjwqqkdtikqkvlgc`, URL `https://qtigkjwqqkdtikqkvlgc.supabase.co` |
| Supabase anon key | in `.env.production` (public by design; RLS limits what it can do) |
| Apps Script web app | `https://script.google.com/macros/s/AKfycbwynuoB0ZnrmneUaPrjJofmxFlg9fS0zmq3xveX-tQktm3k8j_1IPGeZNR2xsjfW8VS/exec` (also the default in `src/lib/application.ts`) |
| Committee sheet | https://docs.google.com/spreadsheets/d/1uLx0Iexc-F8HWYVGymmqYc9bamQkKSHtpkL7ojXU46k (Google sign-in protected) |
| Trustees | Altaf and Imran Jeevunjee. **Their emails are deliberately not in this public repo.** |
| Owner's test email | the owner's own Gmail; `+applicant` / `+student` aliases work for testing |

### Secrets and personal-data rules (keep these)
- **Never** commit personal data: trustee emails, student names, applicant details, or the existing-students import.
  `.gitignore` covers the operator files.
- **Never** use or ask for the Supabase **service_role / secret** key. Nothing needs it.
- Management API tokens are one-off; delete them after use (the owner already did).
- Don't probe the live endpoints for "testing security". Use the local fixtures.

### Private files (the owner has these; not in git)
These were sent to the owner and live in the session's `for-you/` folder:
- `Code-READY-TO-PASTE.gs`: Apps Script with the real trustee emails.
- `supabase-admins.sql`: issues trustee codes for both trustees.
- `import-existing-students.sql`: the 7 existing students. Already imported.
- `schema.sql`: the same file as `supabase/schema.sql`.
- `security-audit/`: the same reports as `docs/security-audit/2026-10/`.

## 4. Decisions and why

| Decision | Why |
|---|---|
| Supabase, not a custom server | Gives a free tier, Postgres row-level security as the single source of truth, auth, storage and no server to run. |
| Hash routing, portal lazy-loaded | Works on GitHub Pages and Vercel without server rewrites; the public site stays light. |
| Email confirmation **off** | Supabase's built-in mail can't reach ordinary inboxes. Every sign-up needs a one-time code instead, which is also how trustees prove who they are. |
| Trustee codes (since `045bf1a`) | The audit showed that a listed email alone let anyone who knew the address become a trustee. |
| Apps Script kept, but only as a notifier | The trustees wanted email alerts and the familiar Sheet. The database is the system of record, and the script only acts on records the database confirms. |
| Documents only in Supabase Storage | One place to secure and to delete from. There are no Drive copies and nothing is attached to emails. |
| Rate limits are global, not per person | No server sees IPs. For a small trust, "pause for an hour or a day" is the right failure mode. |
| `+` email aliases for testing | With confirmation off, aliases work as separate accounts with no mail setup. |
| Vercel for hosting | The owner's choice. It can also send security headers, which GitHub Pages can't. |

## 5. Security audit (October 2026)

- Full reports are in [`docs/security-audit/2026-10/`](docs/security-audit/2026-10/): `REPORT.md`,
  `FINDINGS-DETAIL.md`, `NEEDS-VALIDATION.md`, `findings.json`, the coverage ledger and the run metadata.
- **How it was run:** Cloudflare skill, standard profile, full mode. It used 32 independent agents over 3 hunting
  waves, 3 coverage critics, and 2 verification passes, finishing with 22 coverage units. Target code ran only in an
  OS sandbox, and no live system was touched. Run status: **complete**.
- **Confirmed findings:**
  - **Medium:** trustee takeover through an unclaimed trustee email.
  - **Low:** deleted applicant documents stayed in storage and could come back on re-enrolment.
- **Needs validation** (abuse risks whose impact depends on Google or Supabase quotas):
  - Apps Script mail relay and quota exhaustion.
  - Unbounded Drive files.
  - The script lock could be held to starve real notifications.
  - Unbounded anonymous uploads.
  - Oversized or flooding application rows.
  - An uploaded SVG could redirect a trustee's portal tab.
  - Sign-up may reveal whether an email has an account.
- **Status:** all fixed in `045bf1a` except the last one, which is partly mitigated (see section 6).
- The tooling to repeat the audit is in [`tools/security-audit/`](tools/security-audit/).

## 6. Where it's going: next steps

### A. The owner does these (in this order)
1. **Supabase → SQL Editor → New query:** paste all of `supabase/schema.sql` and click **Run**. It's safe to re-run,
   and it is urgent (see the top of this file). Then check that nobody unexpected already holds a trustee login:
   ```sql
   select a.email, a.claimed, u.created_at from public.admin_emails a
   left join auth.users u on lower(u.email) = lower(a.email);
   ```
2. **Apps Script:** replace the code with the private `Code-READY-TO-PASTE.gs` and save. Then
   **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**, which keeps the same URL.
3. **Deploy to Vercel** from the owner's machine: `git pull && npx vercel --prod`. Note the URL it prints.
4. **Trustee codes:** run the private `supabase-admins.sql`, then send each trustee their own code privately.
   Each trustee creates a login with email, password and code.
5. **Testing:**
   - **Trustee:** `select public.issue_trustee_code('<owner email>');`, then sign up on the site with that code.
   - **Applicant:** a private window → Apply → fake details with `<owner>+applicant@gmail.com`. Check the
     confirmation email, the Sheet row and the portal's Applications page.
   - **Student:** accept the test application, choose **Create access code**, then sign up as
     `<owner>+student@gmail.com` with that code.
   - **Clean up:**
     - Delete the test application from the portal.
     - Delete any test student in Supabase under Table Editor → `students`.
     - Delete the test logins under Authentication → Users.
   - **No setup needed:** `npm run dev` shows the "Preview as trustee/student" buttons with made-up data.

### B. As soon as the Vercel URL exists (a coding agent can do the repo parts)
- **In Supabase (owner):** go to **Authentication → URL Configuration**. Set **Site URL** to the Vercel URL and add the
  redirect URL `<vercel url>/**`. Remove the old GitHub Pages entries. Password-reset links depend on this.
- **In the repo:**
  - Update `PORTAL_URL` in `apps-script/Code.gs` (and the owner's private copy, then make a new deployment version).
  - Update `SITE_URL` in `supabase/setup.mjs`.
  - Update the URLs in `supabase/SETUP.md` and `apps-script/SETUP.md`.
- **Retire GitHub Pages** once Vercel works. In repo Settings → Pages, unpublish the site, and delete or disable
  `.github/workflows/deploy.yml`. The Pages origin (`freeaami.github.io`) is shared with the owner's other Pages
  sites, and Pages can't send security headers.
- In Supabase, turn on **Authentication → "Secure password change"** (re-authentication before a password change).

### C. Later or optional
- **Close the last audit lead fully.** Set up custom SMTP (for example Resend or Postmark) and turn **Confirm email**
  back on. Then sign-up no longer reveals which emails already have accounts.
- **Privacy and retention page.** There is a TODO in `src/components/Sections.tsx:223`. The applicant declaration
  promises deletion on request; the in-portal tools now support that.
- **Self-host the background videos.** They currently stream from a third-party CloudFront host (see `src/content.ts`).
- **Pin GitHub Actions to commit SHAs** (hardening note from the audit).
- **Small portal features**, once the trustees have used it:
  - an admin "remove a student's login" button (currently done in the Supabase dashboard);
  - optionally, blocking logins of withdrawn students.

## 7. Working on the code

```bash
npm ci
npm run dev            # http://localhost:5173 — demo mode (fake data), portal at #/portal
npm run build          # type-check + production build (uses .env.production → live Supabase)
npm run preview        # http://localhost:4173 — the built site against the LIVE database (real data!)

# Database security tests (needs Postgres 16 binaries; uses a throwaway local cluster on port 54329)
initdb -D /tmp/pg -U postgres -A trust
pg_ctl -D /tmp/pg -o "-p 54329 -k /tmp -c listen_addresses=" -l /tmp/pg.log start
PGHOST=/tmp python3 supabase/tests/run_security_tests.py      # expect 105 PASS, 0 failures

node apps-script/tests/run_tests.cjs                           # Apps Script with mocked Google services
```

Conventions:
- Change the database only through `supabase/schema.sql`. Keep it re-runnable (`if not exists`, `create or replace`,
  drop and recreate policies), and add a test to `run_security_tests.py` for every new rule.
- New SECURITY DEFINER functions need `set search_path = public` and an explicit `grant`/`revoke` block at the bottom
  of the file.
- Keep the demo API (`src/portal/demo.ts`) in step with the `PortalApi` interface in `api.ts`.
- Files people upload must stay on the allowlist in `lib/files.ts` and in the bucket `allowed_mime_types` (no SVG).
- Writing style: plain, warm, no promises the trust can't keep. The intended users include people with little money
  and spotty mobile data.

### Gotchas we hit
- Supabase tokens scoped to one project can't call `GET /v1/projects`, so `setup.mjs --project <ref>` goes straight
  to the project.
- `.env.production` is used by `npm run build`; `npm run dev` ignores it, which is why dev runs in demo mode.
- To build in demo mode on purpose, set the variables empty: `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build`.
- The `.who` class name clashed with the site CSS, so the portal uses `pwho`. Portal grids use `minmax(0,1fr)` to
  avoid overflowing on mobile.
- After a schema change, anything that still calls the old function signature fails. Deploy the database first, then
  the site.
