# Jeevunjee site: readiness assessment

> **Update — trustee & student portal added.** Student profiles, courses, instalment schedules (LKR + GBP/EUR/USD with
> per-payment exchange rates), payment logging, documents, trustee notes, one-time student logins, and an
> applications inbox with one-click enrolment. The application journey now asks everything on the Trust's paper
> form. To go live, the portal needs the one-time Supabase setup in `supabase/SETUP.md`; until then it runs in
> preview mode, and applications keep going to the Google Sheet.

**Verdict: ready to launch once the committee finishes a 10-minute Google setup and a privacy notice is written.**
The front end is built, polished and tested. Applications go to a Google Sheet that only the committee can open
(see `apps-script/SETUP.md`), and the copy no longer promises timelines or systems that don't exist.

## What was built

This repo is a production React + Vite + TypeScript build of the Claude Design prototype `Jeevunjee.dc.html`. It follows the final state in
the chat transcripts: the restored cream landing page with the fade-looped hero video, the masked word-by-word headline,
the gold rule, the CTA shimmer, the scroll ribbon, scroll reveals with stagger, expandable steps and pillars, the dark
family section, the apply band with its video, and the eight-step journey with the growing sage stem and the
"Thank you. It has come through." ending.

Tested end to end in Chromium at 1440×900 and 390×844: all eight steps, validation, leave and resume, the send step,
the reference number and focus return. There were no console errors and no horizontal scroll.

## Fixed during polish (bugs and gaps in the prototype)

| Issue in the prototype | Fix |
| --- | --- |
| After leaving the application, every section below the hero stayed **invisible**, and the hero video stayed blank. The site re-mounted, but the reveal and video setup only ran once. | The site stays mounted under the journey (made inert, with scroll locked), so scroll position, videos and reveals survive. |
| **Not responsive.** Fixed 3- and 4-column grids, the nav overflowed, and the journey's header collided with the leave button on phones. | Breakpoints at 960px and 760px. The nav collapses to logo + Apply. On mobile the stem becomes a thin progress line. |
| **No validation.** You could send an application with no name, no contact and no ID. | Gentle inline messages (name, one contact method, situation, what the money is for, story, ID, consent). Household and income stay optional. |
| The copy claimed "progress saves as you go", but nothing was saved. | Answers are kept on the device (not files) and resume where you left off. There's a "Start over" link, and they're cleared after sending. |
| The "Where" question made no sense for people who never went to school. | For "I never had a proper chance to go", it now asks what they'd like to study. |
| Multi-field steps used placeholders as labels, so the question disappeared once you typed. | Visible labels, marked optional where they are. |
| Accessibility | Dialog semantics, Esc to leave, focus moves into each question and back to the button that opened it, keyboard radio cards, aria-expanded on the accordions, skip link, reduced-motion support. |
| Contrast | The gold button (3.0:1) and small grey text (3.3:1) failed WCAG AA. They're darkened slightly to about 5:1 and 4.8:1. |
| Section numbering jumped from "Our belief" straight to 02 | Now "01 · Our belief". |
| Mobile data (the target audience) | The apply video only plays while on screen and is skipped entirely in data-saver mode. |
| No page title, meta description or favicon | Added. |

## Committee inbox (added)

Applications go to a Google Apps Script running inside the committee's own Google Sheet (`apps-script/`):

- Each application becomes one sheet row with a Status dropdown and a notes column. It can be exported to Excel from the File menu.
- Documents stay in the trustee portal's private storage. They're never copied to Drive or attached to emails.
- Altaf and Imran get an email per application with an "Open in the applications sheet" button. Replying goes straight to the applicant.
- The applicant gets a confirmation email with their reference number. References are issued by the server and never repeat.
- The footer's "Committee access" link opens the sheet, protected by Google sign-in.
- Phone photos are shrunk on the device before upload (a 10.9 MB test photo was sent as 1.3 MB), which helps applicants on mobile data.
- Protections: the script only acts on applications that really exist in the portal database (once each, with a secret only the applicant's browser holds), daily email caps, applicant text can't run as a spreadsheet formula, applicant text is escaped in emails, and an email failure never makes an applicant send twice.

Tested by running the real `Code.gs` against stand-ins for Google's services, driven by the real website in Chromium.
It still needs one live test after the committee deploys it.

## Copy promises (reworded)

Removed "within two weeks", the "1–2 weeks" label, "secure portal / tracked in the portal", "deleted 12 months after a
decision", "every decision includes a note" and "re-apply the following cycle". The copy now says what's true: the
Committee reads everything and writes back, documents sit in a private folder, and applicants can ask for deletion at any time.

## Launch blockers (decisions needed from the customer)

1. **Deploy the committee inbox**: follow `apps-script/SETUP.md`, including Altaf's and Imran's real email addresses.
2. **Privacy notice, data retention and committee access** in the footer are placeholder text with no pages behind
   them. The site collects national ID images and income data, so a real privacy notice is needed before launch
   (see Sri Lanka's Personal Data Protection Act No. 9 of 2022).
3. **Videos are hotlinked** from a design-tool CDN folder that could disappear at any time. Download them, self-host
   them, compress them for mobile, and add poster images. (The build environment couldn't reach that CDN, so video
   playback wasn't checked visually. The loop logic is a direct port of the prototype.)
4. **Confirm the facts:** the site shows no public contact email (the old domain is gone), the family names and bios are approved, and the
   "SL" mark next to the logo is intended.

## Recommended, not blocking

- **Sinhala and Tamil versions.** The story question invites applicants to write in Sinhala or Tamil, but everything
  else is English only. That matters for the people this is meant to reach.
- **Shared phones.** Drafts are kept on the device until sent. The UI says so, but on a shared family phone, consider
  whether the story and income answers should persist at all.
- A light analytics or uptime check once it's live, and a real 404 page if it's deployed on a static host.

## Security audit (October 2026)

An end-to-end audit (Cloudflare security-audit skill, full mode) found nine issues in the previous version, two of them
confirmed by reproduction. All are fixed in this version; `supabase/tests/run_security_tests.py` (105 checks) covers
the database rules, including each fix. Summary of what changed:

- **Trustee sign-up needs a one-time trustee code** (`issue_trustee_code`), not just a listed email.
- **Apps Script can't be abused**: it only acts on real, fresh applications with a per-application secret, no longer
  stores files, holds its lock only for a moment, and caps emails per day.
- **Flood limits**: applications pause after 15/hour or 60/day; uploads must go into one fresh folder (max 30 files,
  150/hour, 400/day); file entries are rebuilt from known fields only; trustee lists are capped.
- **Deletion is real**: deleting a document removes the file in either bucket and it can't be resurrected; trustees can
  delete an unenrolled application with its files, and remove abandoned uploads.
- **Uploaded files can't touch the portal**: SVG and other active types are refused; opened files lose `window.opener`.
- **Hosting headers** (Vercel): CSP, frame-ancestors none, COOP, HSTS, Permissions-Policy.
- Smaller: unneeded functions closed to the public, form drafts expire after 14 days, workflow permissions scoped per
  job, operator data files git-ignored.

Known remaining limits: with email confirmation off, Supabase's sign-up endpoint may reveal whether an email already has
a portal account (it can't create one without a code). Fully hiding that needs email confirmation with a real mail
sender (custom SMTP) — see the audit report.
