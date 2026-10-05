# Connecting the trustee portal (one-time, about 15 minutes)

The portal (`/#/portal` on the site) keeps every student's profile, course, payment schedule, payments and documents
in a private **Supabase** database. Until it's connected, the portal runs in **preview mode** on fictional sample data,
and applications keep going to the Google Sheet as before.

Supabase's free plan is enough for the Trust. Nothing here needs code.

---

## 1. Create the project

1. Go to <https://supabase.com> → **Start your project** and sign in (signing in with GitHub is easiest).
2. **New project**:
   - **Name:** `jeevunjee`
   - **Database password:** use the *Generate* button, then save it in a password manager. You'll rarely need it.
   - **Region:** *South Asia (Mumbai)*, or *Southeast Asia (Singapore)*, whichever is offered. This keeps it close to Sri Lanka.
   - **Plan:** Free.
3. Wait a minute or two while it's set up.

## 2. Create the tables and security rules

1. In the left menu, open **SQL Editor** → **New query**.
2. Paste in the whole of [`schema.sql`](./schema.sql) and press **Run**. You should see *"Success. No rows returned"*.

This creates the database, the two trusts, the private file storage, and the rules for who can see what:
- Trustees see everything.
- A student sees only their own file.
- The public can only send an application.

## 3. Register the trustees

In a **new** SQL query, run the short snippet you were given separately (`supabase-admins.sql`). It lists the
trustees' email addresses. Only these emails can create trustee logins; nobody else can sign up without a code.

## 4. Two settings in Authentication

1. **Authentication → Sign In / Providers → Email**: turn **off** “Confirm email”, then **Save**.
   *(Sign-ups are already restricted to the trustees and to students holding a one-time code. Supabase's built-in
   email can't reach ordinary inboxes, so confirmation emails would never arrive.)*
2. **Authentication → URL Configuration**:
   - **Site URL:** `https://freeaami.github.io/Jeevunjee-site/`
   - **Redirect URLs → Add URL:** `https://freeaami.github.io/Jeevunjee-site/**`

## 5. Send the two keys

Open **Project Settings → API Keys** (on older dashboards, **Project Settings → API**) and copy:
- the **Project URL**, which looks like `https://abcdxyz.supabase.co`
- the **anon / publishable** key

Send both to whoever manages the site. They are designed to be public: what they can do is limited by the security
rules from step 2.

> ⚠️ **Never** share the **service_role** / **secret** key. It bypasses every rule.

## 6. Bring in the existing students (optional, recommended)

Run the separate `import-existing-students.sql` in the SQL Editor. It loads the students from the old trust
spreadsheet: names, courses, fees and what's been paid. A few things from that sheet need checking, and the file
lists them at the top (possible duplicate names, due dates, exchange rates).

## 7. Trustees create their logins

Once the site is connected, each trustee opens the site → **Sign in** → **First time here? Create your login** →
enters their email and a password, leaving the access code empty.

---

## Everyday use

- **Add a student** (Students → *Add student*), or accept one from **Applications**. Accepting an application fills
  in the student's details, course, payment plan and documents automatically.
- **Payment schedule:** add one instalment per payment (e.g. *Year 2 — Semester 1*), with rupee and foreign amounts.
- **Log a payment** next to the instalment. Enter the exchange rate on the day, so the real cost in rupees is
  locked in.
- **Give a student a login:** open their file → **Login** → **Create an access code** → *Send on WhatsApp*. The
  code works once, for 14 days. With it, the student can see their schedule and upload invoices and results.
- Every student has a **code** (S-001, S-002…) next to their name everywhere, so students with the same name are
  never mixed up.

## Good to know

- **Password resets:** “Forgot password” sends an email, but Supabase's built-in email only reaches the project's
  own team. To make resets work for everyone, add an email sender: **Authentication → Emails → SMTP Settings**. A
  Gmail account with an [app password](https://support.google.com/accounts/answer/185833) works
  (host `smtp.gmail.com`, port `465`).
- **Free projects pause** after a week without visits. The site's GitHub Action **Keep Supabase awake** pings it
  twice a week so this doesn't happen.
- **Backups:** Database → Backups. On the free plan, export important data now and then. *Table Editor → students
  → Export to CSV* gives you a spreadsheet.
- **Testing the rules:** `tests/run_security_tests.py` runs 64 checks against a local Postgres to prove a student
  can't see another student's file, the public can't read anything, and so on.
