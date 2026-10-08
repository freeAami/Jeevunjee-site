# Findings detail

Confirmed records of medium or higher severity.

## Anyone who knows an unclaimed trustee email can sign up as a trustee (admin), because the project's setup turns off email confirmation

`supabase/schema.sql:handle_new_user:admin-email-claim-without-ownership-proof` · severity **medium** · confidence high

**Root cause.** handle_new_user treats knowing an unclaimed allow-listed email address as enough to get the admin role. It does not check email_confirmed_at, an invite or a secret. The deployment path in the repository (setup.mjs:193, SETUP.md:43) turns off email confirmation, which is the only Supabase Auth control that would tie that address to mailbox ownership.

**Intended behaviour.** Only the real owner of an allow-listed trustee mailbox should be able to create the trustee login. The admin role should depend on verified email ownership (confirmation, or a service-role invite or magic link) or on a secret one-time trustee code, the same way students need an access code.

### Trace
1. `src/portal/api.ts:126` (entrypoint, createLiveApi.signUp): Public supabase.auth.signUp with the anon key, an email and password chosen by the attacker, and only access_code in user metadata. Login.tsx:61 tells trustees to leave the code empty.
2. `supabase/setup.mjs:174` (propagation, main step 5): Trustee emails are inserted into public.admin_emails with claimed defaulting to false. This opens the claim window until each trustee signs up.
3. `supabase/setup.mjs:193` (propagation, main step 7 auth settings): mailer_autoconfirm:true, so GoTrue inserts a confirmed auth.users row and returns a session without verifying the inbox. SETUP.md:43 gives the same manual instruction.
4. `supabase/schema.sql:261` (propagation, trigger on_auth_user_created): An AFTER INSERT trigger on auth.users runs public.handle_new_user for every new sign-up.
5. `supabase/schema.sql:238` (sink, public.handle_new_user): If lower(new.email) matches an unclaimed admin_emails row, the trigger marks it claimed (line 239) and inserts profiles(role='admin') for the new user. is_admin() (schema.sql:177-180) then returns true for that uid.

### Evidence
- `supabase/schema.sql:238`: The admin branch depends only on the new user's lower(email) being unclaimed in admin_emails. There is no email_confirmed_at, invite or secret check.
- `supabase/setup.mjs:193`: Setup sends mailer_autoconfirm: true in the PATCH to /v1/projects/{ref}/config/auth, which turns off email confirmation.
- `supabase/SETUP.md:43`: The manual setup says to turn off 'Confirm email', on the reasoning that sign-ups are 'already restricted to the trustees'.
- `supabase/SETUP.md:70`: Trustees create their logins after setup with an empty access code, so a claim window exists.
- `supabase/schema.sql:422`: 'admin all' policies on applications, and on students, payments, documents and notes (lines 421-429), give an is_admin() caller full access. Storage policies at lines 479-484 give admin read on both buckets and full access to the files bucket.
- `apps-script/Code.gs:222`: The applicant confirmation email sets replyTo to REPLY_TO (= ADMIN_EMAILS joined, line 24). Source holds only placeholder addresses (line 18), so this shows trustee addresses only if the operator configures the same ones as admin_emails.
- `agents/v1-admin-claim/artifacts/evidence-1.txt:1`: Local reproduction. A non-listed email is refused. A sign-up for the listed trustee email with an empty code gets role admin and is_admin()=t, reads dummy application, student and storage rows, and issues an access code. The genuine trustee's later sign-up with the same address fails.

### Reproduction
- **Dummy attacker:** Anonymous internet user with the public anon key who knows a trustee email address that has not been claimed
- **Inputs:**
  - `insert into admin_emails (email) values ('trustee@x.test');  -- operator setup (setup.mjs step 5), dummy address`
  - `insert into auth.users (email, raw_user_meta_data) values ('trustee@x.test','{"access_code":"","full_name":"attacker"}') returning id;  -- stands in for supabase.auth.signUp({email:'trustee@x.test', password:'<attacker>', options:{data:{access_code:''}}}) with mailer_autoconfirm=true`
  - `set role authenticated; select set_config('request.jwt.claim.sub','<returned id>',false); select public.is_admin(); select reference, full_name, answers from applications; select full_name, nic from students; select bucket_id, name from storage.objects; select length(public.issue_access_code('<student id>'));`
- **Steps:**
  1. Inside the sandbox, initialise Postgres 16 and load supabase/tests/supabase_shim.sql and then supabase/schema.sql into a fresh database.
  2. Control: insert an auth.users row for a non-listed email with no code and observe JVJ_SIGNUP_NOT_ALLOWED.
  3. Insert a dummy trustee email into admin_emails and add a dummy application, a student and an applications-bucket storage object.
  4. Insert an auth.users row for the trustee email with an empty access_code, as GoTrue does on signUp when confirmation is off.
  5. Check profiles.role and admin_emails.claimed. Then act as role authenticated with that uid and query is_admin(), applications, students and storage.objects, and call issue_access_code.
  6. Insert another auth.users row for the same address (the genuine trustee) and observe that it is refused.
- **Observed:** Non-listed control: ERROR JVJ_SIGNUP_NOT_ALLOWED. Attacker row: profiles role=admin, admin_emails trustee@x.test claimed=t. As that uid: is_admin()=t. The reads returned 'JVJ-T-1|Dummy Applicant|{"nic": "DUMMY-NIC"}', 'Dummy Student|DUMMY-NIC-2' and 'applications|incoming/abc/nic-front.jpg', and issue_access_code returned an 8-character code. The genuine trustee's same-address insert failed with a duplicate email error, and a case-variant insert failed with JVJ_SIGNUP_NOT_ALLOWED. GoTrue itself was not run. Autoconfirm turning signUp into an immediate confirmed session is taken from the committed configuration and documented Supabase behaviour.

The invariant this breaks: Only the real owner of an allow-listed trustee mailbox should be able to create the trustee login. The admin role should depend on verified email ownership (confirmation, or a service-role invite or magic link) or on a secret one-time trustee code, the same way students need an access code.

### Conditions and containment
- [system_configuration] Supabase Auth email confirmation is off (mailer_autoconfirm), as supabase/setup.mjs:193 and SETUP.md:43 instruct.
- [data_state] At least one admin_emails entry is still unclaimed: a listed trustee has not signed up yet, never will, or the address was added later.
- [authentication_level] Unauthenticated. The attacker needs only the public anon key and URL (committed in .env.production).
- [environmental_dependency] The attacker knows or guesses the unclaimed trustee address. One route is the Apps Script confirmation replyTo, if ADMIN_EMAILS is set to the same addresses.
- [timing_dependency] The attacker must sign up before the genuine trustee claims the address.

### Remediation
Do not grant admin on an email string match alone. Either provision trustee accounts out-of-band (service-role inviteUserByEmail or a magic link to the address) and refuse public sign-up for admin_emails addresses, or require a secret one-time trustee code in the sign-up metadata, checked the same way as the student code. If confirmation can be turned back on (with SMTP configured), also require new.email_confirmed_at in the admin branch, or move the grant to a confirmation-time trigger. Until then, the operator should have each trustee sign up immediately after setup and check that every claimed admin_emails row belongs to the real trustee. Do not reuse the admin_emails addresses as the applicant-facing replyTo; use a shared alias. Regression test: a sign-up with an allow-listed email and no valid trustee code must raise JVJ_SIGNUP_NOT_ALLOWED.

`supabase/schema.sql`:
```
-- admin_emails gains: invite_code text, invite_expires timestamptz (set by the operator, delivered privately)
if exists (select 1 from public.admin_emails
           where lower(email) = lower(new.email) and not claimed
             and invite_code is not null and invite_code = v_code
             and invite_expires > now()) then
  update public.admin_emails set claimed = true, invite_code = null, invite_expires = null
    where lower(email) = lower(new.email);
  insert into public.profiles (id, role, email, full_name)
    values (new.id, 'admin', new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end if;
```
