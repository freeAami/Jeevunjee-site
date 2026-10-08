# Needs validation

These are prioritised leads with no severity assigned. Each one is source-grounded, but a deployment fact it depends on was not observed: by design, no live system was contacted. The plans below are bounded and must not send traffic to the production deployment.

## Anonymous Apps Script callers can hold the single script lock across attacker-sized Drive writes and starve genuine submissions and notifications

`apps-script/Code.gs:doPost:script-lock-held-across-attacker-drive-writes`

The public Apps Script web app is deployed with 'Execute as: Me' and 'Who has access: Anyone' (apps-script/SETUP.md:43), and its /exec URL is hardcoded in src/lib/application.ts:122. For every request that passes a trivial field check, doPost takes one script-wide lock. While it holds that lock, it base64-decodes each supplied file and writes it to Drive. Nothing bounds the number of files or their total size; the only limit is MAX_FILE_BYTES (10 MiB per file), and that is checked after decoding. When no valid reference is supplied, newReference_ also reads the whole Reference column under the lock. Any other execution that cannot get the lock within 30 s fails in waitLock. The outer catch turns that failure into {ok:false,error:'server-error'}, and no sheet row is written and no email is sent. In the current Supabase-backed deployment, the application itself is stored by Supabase. The trustee notification (sheet row plus new-application email) is sent fire-and-forget with .catch(()=>{}) and is never retried, so a starved notification is silently lost. In the no-Supabase fallback, the genuine applicant's submission is rejected instead. How long one attacker request can hold the lock, and whether simultaneous attacker requests queue or are refused, depend on Google-side limits on POST size, runtime and concurrency that are not visible in source. The root cause is that the lock covers I/O whose size the attacker controls. That is separate from the Drive storage-growth issue (apps-script/Code.gs:saveFiles_:unbounded-drive-file-creation), although both use the same unbounded files[] input.

**Claimed root cause.** In doPost, LockService.getScriptLock().waitLock(30000) (apps-script/Code.gs:69-70) wraps saveFiles_ (Code.gs:76). saveFiles_ writes one Drive file per files[] entry (Code.gs:153-158) with no limit on count or total bytes, and the critical section also includes newReference_ (Code.gs:75, 164-176). The lock is released only at Code.gs:84. The lock only needs to serialise reference generation and appendRow. No file count or body-size check happens before the lock, and there is no authentication or rate limit. Lock hold time therefore grows with attacker input, while other executions time out after 30 s and the catch at Code.gs:94-96 turns them into server-error.

**Affected boundary.** apps-script/Code.gs:96 (doPost catch)

### Trace
1. `apps-script/Code.gs:57` (entrypoint, doPost): Anonymous POST to the public web app (access: Anyone, per apps-script/SETUP.md:43). The handler parses an attacker-chosen JSON body at line 59.
2. `apps-script/Code.gs:65` (propagation, doPost): The only gate is a non-empty fullName, an email or phone, and consent===true. The honeypot at line 62 is bypassed by leaving website empty. There is no authentication, rate limit, or file count/size check before the lock.
3. `apps-script/Code.gs:70` (propagation, doPost): waitLock(30000) is called on the script-wide lock from line 69. Every other execution of the script waits up to 30 s and then throws.
4. `apps-script/Code.gs:76` (propagation, doPost): saveFiles_ is called with the attacker-controlled, unbounded body.files while the lock is held.
5. `apps-script/Code.gs:158` (propagation, saveFiles_): For each file: Utilities.base64Decode (line 154), then folder.createFile of up to 10 MiB. Lock hold time grows with file count and bytes.
6. `apps-script/Code.gs:96` (sink, doPost catch): A concurrent genuine request whose waitLock times out throws into the outer catch and returns server-error before appendRow (line 77) or notifyAdmins_ (line 88), so no row is written and no trustee email is sent.

### Evidence
- `apps-script/Code.gs:69`: getScriptLock() returns one lock shared by every execution of the script.
- `apps-script/Code.gs:84`: releaseLock runs in the finally block, only after saveFiles_ and appendRow have completed.
- `apps-script/Code.gs:31`: MAX_FILE_BYTES = 10 MiB is a per-file limit only, enforced after decoding at line 155. There is no limit on file count or total size.
- `apps-script/Code.gs:166`: newReference_ reads the entire Reference column under the lock when the request has no valid reference.
- `apps-script/SETUP.md:43`: The deployment instructions set Execute as: Me and Who has access: Anyone, so doPost is reachable without authentication.
- `src/lib/application.ts:122`: The public /exec endpoint URL is hardcoded in the client bundle.
- `src/lib/application.ts:226`: Trustee notifications in the Supabase path are fire-and-forget (.catch(()=>{}) at line 231, no retry), so a server-error caused by lock starvation is silently lost.
- `src/lib/application.ts:250`: In the fallback mode, the full genuine application goes through the same lock, and starvation surfaces as a submission failure at lines 255-257.
- `agents/h10b-lock-starvation/artifacts/evidence-1.txt:1`: Mock harness running the unmodified Code.gs: Drive createFile calls under the lock were 1, 10 and 100 for 1, 10 and 100 files. A genuine request made while the lock was held returned server-error, with 0 mails sent and no row appended.

### Blockers
- Google-side limits are not visible in source: the maximum Apps Script web-app POST body size, the per-execution runtime cap (about 6 min on consumer accounts), and the simultaneous-execution limit for this deployment. Together they set the longest lock hold one attacker request can cause, and whether simultaneous attacker and genuine requests queue on the lock or are refused by Google first.
- Real DriveApp.createFile and Utilities.base64Decode latency per byte, which turns attacker bytes into seconds of lock hold, cannot be measured without calling Google services, and that is out of scope.
- Whether the owner's account type (consumer or Workspace), and any Google front-end throttling of anonymous /exec callers, changes these quotas is a deployment fact.

### Resolution plans
- **local:** Source review confirms the lock scope (Code.gs:69-84) and that no count or size check precedes it. The hunter's mock harness (agents/h10b-lock-starvation/artifacts/evidence-1.txt) shows Drive writes under the lock scale linearly with files[], and that a request hitting a lock timeout returns server-error with no row or mail. Regression check after the fix: in the same mock harness, assert that createFile is never called while the lock is held. Also assert that doPost rejects files.length > 8, or a total base64 length above a fixed cap, before calling getScriptLock.
- **deployment:** Owner-observed only, on a disposable copy of the script, sheet and Drive folder that the owner controls, never the production /exec URL. 1) POST one request containing about 8 dummy 5 MiB files and record its duration in Apps Script > Executions. 2) While it runs, POST a minimal files:[] request with a valid dummy reference, and record whether it logs 'Lock timeout' / server-error or succeeds. 3) Note the account's Apps Script quotas for maximum POST size, script runtime and simultaneous executions. 4) Delete the copy's test files and rows afterwards. The finding holds if one bounded request can keep the lock past 30 s and a concurrent genuine request is dropped.

**Remediation status:** Apps Script no longer accepts or stores files; the lock covers only appendRow (tryLock 20 s); requests without a database-verified reference+secret are rejected before any work.

## Unauthenticated Apps Script doPost sends mail from the trust's account to arbitrary addresses and can exhaust the daily quota that trustee notifications depend on

`apps-script/Code.gs:doPost:unauthenticated-mailapp-quota-relay`

apps-script/SETUP.md:43 tells the owner to deploy the web app as Execute as: Me / Who has access: Anyone, and the /exec URL is hardcoded as the default NOTIFY_ENDPOINT in the public client (src/lib/application.ts:120-122). doPost has three checks: the honeypot (body.website must be empty, which a direct caller leaves empty), a non-empty fullName, email or phone, and consent === true. All three are caller-controlled. Once they pass, doPost appends a sheet row and makes two MailApp.sendEmail calls from the owner's account. The first goes to both ADMIN_EMAILS (2 recipients). The second goes to the caller-chosen answers.email (1 recipient) because SEND_APPLICANT_CONFIRMATION is true. There is no shared secret, rate limit, per-recipient or per-day counter, captcha, and no binding to a real Supabase submission. Two results follow. (a) Anyone can make the trust's Gmail send 'We received your application' mail to any third-party address, with the attacker's first name inserted after HTML escaping. This can damage the trust's sending reputation. (b) Each forged request uses 3 recipients of the owner's MailApp daily budget. SETUP.md:76 puts that budget at about 100 per day for a regular Gmail account, so about 33 requests would use it up. After that, notifyAdmins_ throws for every real application, and Code.gs:88 swallows the error with console.error. The applicant still gets ok:true, so trustees silently stop getting new-application emails for the rest of the quota day. In Supabase mode, notifyTrustees (src/lib/application.ts:191,223-231) depends on this same endpoint and quota. Sheet rows and Supabase records are still written, so applications are not lost; only the alert emails stop. Local reproduction used sandboxed node with Code.gs unmodified and a MailApp mock enforcing 100 recipients. 33 forged POSTs sent 33 confirmation mails to the third-party address and used 99 of 100 recipients. The next real POST, shaped like notifyTrustees (consent:true, files:[], website:''), returned {ok:true}, delivered 0 admin mails, and logged the swallowed quota error (agents/v2-mail-quota/artifacts/evidence-1.txt). Corrections to the hunter's record: the deployment-access evidence is SETUP.md:43, not :32, and the quota statement is SETUP.md:76, not :65.

**Claimed root cause.** doPost (apps-script/Code.gs:57-98) is a public, unauthenticated entry point. It sends mail from the owner's account to the trustees (notifyAdmins_, Code.gs:207-213) and to a caller-chosen recipient (confirmApplicant_, Code.gs:218-219). It has no per-recipient, per-source or per-day bound and does not check that the call corresponds to a real application. Mail failures are swallowed (Code.gs:88-91), so running out of quota is invisible to applicants and trustees.

**Affected boundary.** apps-script/Code.gs:218 (confirmApplicant_)

### Trace
1. `src/lib/application.ts:120` (entrypoint, NOTIFY_ENDPOINT): The Apps Script /exec URL is the hardcoded default in the public client bundle (lines 120-122), so anyone can find it and POST to doPost directly.
2. `apps-script/Code.gs:62` (propagation, doPost): The honeypot rejects only callers that fill body.website; a direct caller leaves it empty.
3. `apps-script/Code.gs:65` (propagation, doPost): The only gate is fullName plus email or phone plus consent===true, all supplied by the caller. There is no secret, rate or reference check.
4. `apps-script/Code.gs:88` (propagation, doPost): notifyAdmins_ runs for every accepted request. A failure such as quota exhaustion is swallowed with console.error and the caller still gets ok:true (line 93).
5. `apps-script/Code.gs:207` (propagation, notifyAdmins_): MailApp.sendEmail to both ADMIN_EMAILS, using 2 quota recipients per request.
6. `apps-script/Code.gs:218` (sink, confirmApplicant_): MailApp.sendEmail to the caller-chosen str_(a.email), using 1 quota recipient, sent from the trust's account to an arbitrary third party.

### Evidence
- `apps-script/Code.gs:21`: SEND_APPLICANT_CONFIRMATION = true, so a confirmation goes to any caller-supplied address.
- `apps-script/Code.gs:90`: The confirmation is sent whenever str_(a.email) is non-empty. The address is unverified and has no per-address or per-day limit.
- `apps-script/SETUP.md:43`: Documented deployment is Execute as: Me / Who has access: Anyone, so mail uses the owner's identity and quota and anonymous callers can reach doPost.
- `apps-script/SETUP.md:76`: Documents that a regular Gmail account can send about 100 emails a day through scripts. At 3 recipients per forged request, about 33 requests would use that up.
- `src/lib/application.ts:191`: With Supabase configured, every real application still notifies the trustees through this same Apps Script and quota (notifyTrustees, lines 223-231, fire-and-forget).
- `src/lib/application.ts:218`: sheetSummary always sets consent: true, so a forged request is indistinguishable from a real notification.
- `agents/v2-mail-quota/artifacts/evidence-1.txt:3`: Sandboxed harness with unmodified Code.gs and a 100-recipient MailApp mock: 33 forged POSTs sent 33 mails to a third-party address and used 99/100 recipients. The next real POST returned ok:true with 0 admin mails and a swallowed 'Service invoked too many times' error.

### Blockers
- The owner's real MailApp daily recipient quota (consumer Gmail about 100 vs Workspace about 1500) and Google's exact error behaviour when it runs out are deployment facts not visible in source. The local proof uses a mocked 100-recipient budget taken from SETUP.md:76.
- Whether Google's own abuse controls on Apps Script web apps throttle or block repeated anonymous doPost executions before the quota runs out cannot be observed locally, and must not be tested against the live endpoint or with real third-party recipients.
- Whether the deployed version matches apps-script/Code.gs (SEND_APPLICANT_CONFIRMATION true, access 'Anyone') can only be confirmed by the owner in the Apps Script project.

### Resolution plans
- **local:** Run scratch/harness.js inside the sbx sandbox (node, vm-loaded unmodified apps-script/Code.gs, MailApp mock that throws once used recipients plus new recipients exceed QUOTA). Send floor(QUOTA/3) forged POSTs {answers:{fullName,email:<third party>,consent:true},website:''}, then one POST shaped like notifyTrustees. Expected and observed with QUOTA=100: 33 third-party mails, legitimate POST returns ok:true, 0 admin mails, 1 swallowed error. Repeat with QUOTA=1500 to bound the Workspace case (about 500 requests). Regression after the fix: forged POSTs without a valid HMAC or shared secret, or over a per-recipient/per-day CacheService/PropertiesService counter, must be rejected before any MailApp call. A real notification must still produce exactly one admin mail.
- **deployment:** Owner only, read-only and non-destructive. In the Apps Script editor, confirm the account type (consumer Gmail or Workspace) and run MailApp.getRemainingDailyQuota() to record the actual daily recipient budget. Under Deploy > Manage deployments, confirm the active version's Execute as / Who has access settings and that the deployed code has SEND_APPLICANT_CONFIRMATION = true. In the Executions log and the sent-mail folder, check for doPost runs or confirmation emails that don't match real applications, and for any 'Service invoked too many times: email' errors. Do not send test traffic to the live /exec URL or to third-party addresses.

**Remediation status:** Mail is sent only for applications returned once by claim_notification (reference + per-application secret, within an hour), using database data, with per-day caps (25 trustee, 20 applicant).

## Unauthenticated doPost can create an unlimited number of files in the owner's Google Drive

`apps-script/Code.gs:saveFiles_:unbounded-drive-file-creation`

The Apps Script web app is deployed 'Execute as: Me' with 'Who has access: Anyone' (apps-script/SETUP.md:43), and its URL is hardcoded in the public client (src/lib/application.ts:122). doPost needs only fullName, consent:true and an email or phone, plus an empty honeypot. It then passes body.files to saveFiles_ whether or not the deployed site still sends files. saveFiles_ creates one new sub-folder per request and one Drive file per entry that has a data field. The only bound is a 10 MB check on each decoded file. There is no limit on files per request, total bytes per request, or requests per caller or per day. The Supabase path has equivalents: submit_application caps an application at 30 files, and the storage bucket has size limits. Any image/* type, including image/svg+xml, and application/pdf are stored with the declared type; any other type is stored as application/octet-stream. Every file counts against the owner's Google storage quota. On a consumer account, Drive, Gmail and Photos share that quota, so filling it would stop the trust's Gmail receiving mail until someone deletes the data by hand. How much one request can persist depends on Google's real POST body-size, execution-time and DriveApp quotas. Whether storage is shared with the trust's inbox depends on the owner's plan. Neither is visible in source. The ScriptLock (Code.gs:69-70) only makes requests run one at a time; it does not limit them.

**Claimed root cause.** saveFiles_ (apps-script/Code.gs:149-160) can be reached by anyone without authentication through doPost. Before calling folder.createFile with the caller's bytes, it applies no limit on file count, total bytes, or requests per caller or per day. The only check is MAX_FILE_BYTES on each file.

**Affected boundary.** apps-script/Code.gs:158 (saveFiles_)

### Trace
1. `apps-script/Code.gs:57` (entrypoint, doPost): Public web-app POST handler (deployed with access 'Anyone', SETUP.md:43); the JSON body is fully controlled by the caller.
2. `apps-script/Code.gs:65` (propagation, doPost): The only gate is that fullName, email or phone, and consent:true are present; there is no authentication, secret, captcha or rate limit.
3. `apps-script/Code.gs:76` (propagation, doPost): body.files is passed to saveFiles_ with no check on its length or total size.
4. `apps-script/Code.gs:152` (propagation, saveFiles_): Each request creates a new sub-folder in the owner's private documents folder.
5. `apps-script/Code.gs:155` (propagation, saveFiles_): The only bound is decoded size of 10 MB or less per file; there is no count or cumulative limit.
6. `apps-script/Code.gs:158` (sink, saveFiles_): folder.createFile saves the caller's bytes in the owner's Drive, counting against the owner's storage quota.

### Evidence
- `apps-script/Code.gs:31`: MAX_FILE_BYTES = 10 MB applies to each file only.
- `apps-script/Code.gs:150`: Every entry with a data field is kept. In the verifier's sandboxed harness, 3 POSTs of 200 files each gave 600 createFile calls and 3 sub-folders (agents/v3-drive-files/artifacts/evidence-1.txt).
- `apps-script/Code.gs:156`: Any type matching image/* (including image/svg+xml), and exactly application/pdf, are stored as sent; other types become application/octet-stream.
- `apps-script/SETUP.md:43`: The deployment is set to Execute as: Me and Who has access: Anyone, so files are stored under the owner's account.
- `src/lib/application.ts:122`: The web-app /exec URL is hardcoded in the public client bundle.

### Blockers
- Google's real Apps Script limits are deployment facts not visible in source: the POST body-size limit, the execution-time limit (with requests serialised by the ScriptLock wait at Code.gs:70) and the DriveApp file-creation and daily quotas. Together they set how many bytes one request, and one day of requests, can persist.
- Whether the impact is meaningful depends on the owner's Google storage plan and on whether that storage is shared with the Gmail inbox the trust relies on. Both are deployment facts.

### Resolution plans
- **local:** Already reproduced in the sandboxed node harness with mocked Google services: 3 unauthenticated doPost bodies of 200 x 1 KiB image/svg+xml files each gave 600 createFile calls and 3 sub-folders, with no limit reached. Regression test after the fix: a body with 31 files, or a total decoded size over the chosen cap, must be rejected before getFolder_/createFolder/createFile is called. A request beyond the per-day counter (for example a CacheService/PropertiesService count) must also be rejected before any Drive call.
- **deployment:** Read-only owner checks; do not upload test data to the live endpoint. (1) In the Google account, check the storage plan and whether its quota is shared with the Gmail inbox that receives applications. (2) Check the Apps Script deployment settings (Execute as / Who has access) and the executions log for doPost volume. (3) Check the Drive folder 'Jeevunjee applications — documents (private)' for unexpected sub-folders or files, and note the account's current storage use. (4) Compare against Google's published Apps Script quotas (POST size, run time, Drive writes) for the account type to estimate how many bytes per day an anonymous caller could persist.

**Remediation status:** saveFiles_ removed; documents stay in Supabase storage.

## Trustee 'Open' file keeps window.opener, so an applicant-uploaded scripted SVG could redirect the trustee's portal tab (reverse tabnabbing)

`src/portal/admin/StudentFile.tsx:openFile:window-opener-retained-uploaded-svg-tabnabbing`

openFile (src/portal/admin/StudentFile.tsx:307-319) opens a blank tab with window.open('', '_blank'). That call has no 'noopener' feature and never sets w.opener = null. The code then sets w.location.href to a 30-minute Supabase Storage signed URL (api.ts:265) for a file uploaded by an applicant or student. Both buckets allow 'image/*' (schema.sql:464-465), which matches image/svg+xml. The anon/authenticated policy at schema.sql:476-477 lets anyone insert under applications/incoming/. submit_application only checks the path shape ^incoming/[0-9a-f-]{36}/[^/]+$ (schema.sql:298-300) and stores whatever name and mime the caller sends. The client-side image shrinking in application.ts:182-187 is skipped when Storage and the RPC are called directly. When a trustee clicks the file's 'Open' button in the application view (Applications.tsx:217), the uploaded document loads in a tab that still has opener access to the portal tab. The same applies to student-uploaded documents opened from DocRow (StudentFile.tsx:405). If Storage serves the SVG inline with script enabled, the SVG can navigate the trustee's portal tab to an attacker-hosted fake sign-in page and phish the trustee's credentials. The SVG runs on the storage origin, so it cannot read portal localStorage or the session. No portal-side Cross-Origin-Opener-Policy is configured: vercel.json sets only X-Content-Type-Options, Referrer-Policy and X-Frame-Options, and GitHub Pages cannot set COOP. A sandboxed Chromium 141 run of the exact openFile pattern independently showed that a cross-origin image/svg+xml document navigates the opener tab, and that setting w.opener = null before navigation prevents it. Whether deployed Supabase Storage serves such an object inline with script execution has not been observed.

**Claimed root cause.** openFile in src/portal/admin/StudentFile.tsx calls window.open('', '_blank') without 'noopener' and does not null w.opener before pointing the new tab at an untrusted, uploader-controlled storage object. The bucket allowed_mime_types entry 'image/*' admits active SVG content, and the portal sends no COOP header that would sever the opener.

**Affected boundary.** src/portal/admin/StudentFile.tsx:309 (openFile)

### Trace
1. `supabase/schema.sql:476` (entrypoint, storage policy "jvj applicants upload"): Anon and authenticated users may insert any object under applications/incoming/. The bucket allows 'image/*' (schema.sql:464), which matches image/svg+xml at the policy/MIME-list level.
2. `src/lib/application.ts:182` (propagation, submitApplication): The legitimate client uploads with a caller-chosen contentType and records {field,label,name,path,mime,size} in p_files. An attacker can skip this code and call Storage and the submit_application RPC directly. The RPC (schema.sql:298-300) checks only the path regex, not the file type.
3. `src/portal/admin/Applications.tsx:217` (propagation, ApplicationAnswers FileLinks): The trustee's application view renders an Open button for each applicant file. The button calls openFile(api, 'applications', f.path, onError).
4. `src/portal/api.ts:265` (propagation, createLiveApi.fileUrl): createSignedUrl(path, 1800) returns a signed URL on the Supabase Storage origin for the attacker-supplied object.
5. `src/portal/admin/StudentFile.tsx:309` (sink, openFile): const w = window.open('', '_blank') keeps the opener relationship. w.location.href = url (line 312) then loads the untrusted document in a window that can navigate the trustee's portal tab through window.opener.location.

### Evidence
- `src/portal/admin/StudentFile.tsx:309`: window.open('', '_blank') with no 'noopener' feature and no w.opener = null before navigation at line 312.
- `src/portal/admin/StudentFile.tsx:405`: The same openFile is used for documents in the student's file (doc.bucket/doc.path), including student uploads under files/students/<own id>/ (schema.sql:493-496). This is a student-to-trustee variant of the same root cause.
- `supabase/schema.sql:464`: allowed_mime_types array['image/*','application/pdf'] for the applications bucket (the files bucket at line 465 is the same), which admits image/svg+xml.
- `supabase/schema.sql:299`: submit_application validates only the file path shape, not the extension or mime, so an SVG object path is accepted into applications.files.
- `vercel.json:10`: The only response headers are X-Content-Type-Options, Referrer-Policy and X-Frame-Options. There is no Cross-Origin-Opener-Policy to sever the opener across origins.
- `agents/v5-opener/artifacts/evidence-1.txt:16`: Independent sandboxed Chromium 141.0.7390.37 run of the as-shipped openFile pattern. A cross-origin image/svg+xml document saw window.opener present and navigated the opener tab to a dummy fake sign-in page on 127.0.0.1:8912.
- `agents/v5-opener/artifacts/evidence-1.txt:17`: Control run: with w.opener = null set before navigation, the SVG saw opener null and the portal tab stayed on its own origin. This confirms the proposed source fix.

### Blockers
- Not source-visible or locally observable: whether deployed Supabase Storage serves an object uploaded with contentType image/svg+xml via a signed URL inline as image/svg+xml with script execution. A sandboxing Content-Security-Policy, Content-Disposition: attachment, a forced non-active Content-Type, or a COOP header on the storage response would each block or sever the attack. Both local reproductions used a loopback stand-in origin, not storage-api.
- Not observed: whether the deployed storage-api wildcard check for 'image/*' accepts an image/svg+xml upload into the applications and files buckets.

### Resolution plans
- **local:** Already observed in agents/v5-opener/artifacts/evidence-1.txt (and in the hunter's agents/h4-client/artifacts/evidence-1.txt): in sandboxed Chromium 141, the exact openFile pattern let a cross-origin scripted SVG navigate the opener tab, and w.opener = null prevented it. To finish locally without the network, run a pinned local supabase/storage-api container (pre-pulled image) with the schema's bucket rows. As anon, upload a dummy SVG <svg xmlns='http://www.w3.org/2000/svg'><script>document.title='ran'</script></svg> with contentType image/svg+xml to applications/incoming/<uuid>/x.svg. As a dummy admin, create a signed URL and fetch it. Record whether the upload is accepted and the response Content-Type, Content-Security-Policy, Content-Disposition and Cross-Origin-Opener-Policy headers. Then open the URL through the built portal's openFile in Playwright and check whether the dummy portal tab is navigated.
- **deployment:** Owner check in the project's own Supabase project only, with no other users' data: upload a harmless SVG containing <script>document.title='ran'</script> as image/svg+xml to a test path such as applications/incoming/00000000-0000-0000-0000-000000000000/test.svg. Create a signed URL from the dashboard and open it in a browser. Record the response Content-Type, Content-Security-Policy, Content-Disposition and Cross-Origin-Opener-Policy headers and whether the title changes to 'ran'. Then delete the test object. Fix regardless of the result: use window.open('', '_blank', 'noopener') or set w.opener = null before assigning w.location.href in openFile. Narrow allowed_mime_types to image/jpeg, image/png, image/webp, image/heic and application/pdf. Optionally pass { download: true } to createSignedUrl for non-image types.

**Remediation status:** w.opener = null before navigation; buckets and client accept explicit raster types + PDF only (no SVG); COOP header on Vercel.

## Anonymous sign-up responses may reveal which emails hold trustee or student portal accounts

`supabase/schema.sql:handle_new_user+supabase/setup.mjs:mailer_autoconfirm:signup-account-existence-oracle`

Anyone with the public anon key can call Supabase Auth signUp(email, anyPassword) without an access code. The operator setup turns email confirmation off (setup.mjs sets mailer_autoconfirm: true; SETUP.md tells the operator to turn off 'Confirm email'). For an email with no account, not on the unclaimed admin_emails list and sent without a valid code, the AFTER INSERT trigger handle_new_user raises JVJ_SIGNUP_NOT_ALLOWED. The insert is rolled back and the caller receives the provider's 'Database error saving new user' error, so no account is created and no mail is sent. For an email that already has an auth.users row, the insert is expected never to reach the trigger: with autoconfirm on, GoTrue is expected to return an explicit 'User already registered' error (user_already_exists). The client already handles the two cases separately. friendlyError (api.ts:49 and :51) maps them to different messages, and Login.tsx:33 shows the result to an unauthenticated visitor. If the provider behaves as expected, an attacker can test a list of emails and learn which people are trustees or scholarship students of a small trust, without side effects. That is a protected fact about an identifiable group, and it also helps targeted phishing or password guessing. Sign-in is not an oracle because every failure gives one message (api.ts:50). Source review confirms the whole path in the repository. The only part not shown in source is whether hosted GoTrue reports existing confirmed users explicitly when autoconfirm is on.

**Claimed root cause.** Sign-up is left open to the anon key with email autoconfirm on, so GoTrue is expected to report an existing user explicitly before any insert. The allow-list rejection is a RAISE inside an AFTER INSERT trigger on auth.users, which produces a different error ('Database error saving new user') for emails without an account. No layer makes the responses for existing and non-existing emails the same.

**Affected boundary.** supabase/schema.sql:257 (public.handle_new_user)

### Trace
1. `src/portal/api.ts:126` (entrypoint, createLiveApi.signUp): Unauthenticated sign-up calls supabase auth.signUp (line 128) with the anon key, an attacker-chosen email and password, and an access_code that may be empty. The same request can be sent straight to /auth/v1/signup.
2. `supabase/setup.mjs:193` (propagation, main step 7 auth config): The operator CLI PATCHes the project auth config with mailer_autoconfirm: true, which turns off email confirmation. With confirmation off, GoTrue is expected to return an explicit user_already_exists error for an existing email instead of an obfuscated success.
3. `supabase/schema.sql:261` (propagation, trigger on_auth_user_created): For an email with no account, the auth.users insert fires handle_new_user AFTER INSERT for each row.
4. `supabase/schema.sql:257` (sink, public.handle_new_user): If the email is not an unclaimed admin_emails entry and no valid unexpired access code is given, the trigger raises JVJ_SIGNUP_NOT_ALLOWED. The insert is rolled back and the caller receives 'Database error saving new user', which differs from the 'already registered' response for an existing account.

### Evidence
- `src/portal/api.ts:51`: friendlyError maps /already registered/ to 'An account with this email already exists — sign in instead.', so the existence state is shown directly to whoever submits the form.
- `src/portal/api.ts:49`: 'Database error saving new user' / JVJ_SIGNUP_NOT_ALLOWED gets a separate message (invalid code or not a registered trustee), so the two states differ in the UI as well as in the raw API.
- `supabase/SETUP.md:43`: The manual setup guide tells the operator to turn off 'Confirm email'. That is the setting under which GoTrue is expected to disclose existing accounts on sign-up.
- `src/portal/Login.tsx:33`: The sign-up error is shown through friendlyError to an unauthenticated visitor.
- `src/portal/api.ts:50`: Sign-in is not an oracle: every credential failure gives one 'Invalid login credentials' message. The disclosure is specific to sign-up.
- `supabase/schema.sql:238`: The only non-raising paths are an unclaimed admin_emails match (line 238) or a valid unexpired access code (lines 245-253). Every other email without an account reaches the raise at line 257, so the 'not registered' response is the same for every arbitrary email.

### Blockers
- Hosted GoTrue behaviour: the exact HTTP status and error code returned by POST /auth/v1/signup for an email that already belongs to a confirmed user while mailer_autoconfirm is true (expected 422 user_already_exists 'User already registered'). The GoTrue server is not in the repository or in this sandbox, which has no gotrue binary and no network, so this cannot be observed locally. Only the client library (node_modules/@supabase/auth-js) is present; it lists user_already_exists as a known error code but does not show server behaviour.
- Deployment state: whether the live project actually has autoconfirm on (setup.mjs step 7 can fail and fall back to the manual SETUP.md step), and the configured sign-up rate limit per IP, which limits how many emails can be tested per hour.

### Resolution plans
- **local:** On a workstation with Docker and the Supabase CLI (not available in this audit sandbox), run `supabase start` with [auth.email] enable_confirmations = false and apply supabase/schema.sql. Insert one dummy email (e.g. trustee-test@example.invalid) into public.admin_emails, then sign it up once so it holds a confirmed account. Send POST http://127.0.0.1:54321/auth/v1/signup with apikey=<local anon key> and body {"email":"trustee-test@example.invalid","password":"Dummy-pass-123","data":{"access_code":""}}. Repeat with an unseen dummy email (nobody@example.invalid). Record the HTTP status, error_code and msg for each. 422 user_already_exists versus 500 unexpected_failure 'Database error saving new user' confirms the oracle. Identical bodies refute it. Confirm that SELECT count(*) FROM auth.users did not change after the second request.
- **deployment:** The project owner, on a staging copy or with their own two test addresses (one that already holds a test portal account, one that does not), submits the 'create account' form with no access code and compares the /auth/v1/signup responses (status, error_code, msg) in the browser devtools Network tab. Do not use real trustee or student emails. In the Supabase dashboard, check that Authentication → Sign In / Providers → Email shows 'Confirm email' off, and note the sign-up limit under Authentication → Rate Limits.

**Remediation status:** Partially mitigated: an account still cannot be created without a valid code, and the UI no longer depends on the distinction, but GoTrue may still answer differently for existing emails while confirmation is off. Full fix: custom SMTP + email confirmation, or account creation via a uniform-response Edge Function.

## Anonymous callers can add unlimited unreferenced objects to the private applications bucket, and trustees cannot delete them through the portal

`supabase/schema.sql:storage-policy:jvj-applicants-upload:unbound-anonymous-orphan-uploads`

The storage.objects INSERT policy "jvj applicants upload" (supabase/schema.sql:476-477) lets the anon and authenticated roles insert any object into the private 'applications' bucket as long as the object's first folder is 'incoming'. The anon key is public by design. Nothing ties an upload to a submitted application. There is no count or byte limit per folder, per submission or in total, and no expiry or cleanup of objects that no application references. The only bounds in source are the bucket's 10 MiB per-object limit and its client-declared MIME allow-list (schema.sql:464). The only policy that allows DELETE or ALL is restricted to bucket 'files' (schema.sql:482-484), and the portal only calls storage.remove on 'files' (src/portal/api.ts:253,261). So trustees cannot remove orphaned objects from 'applications'; only the project owner can, through the dashboard or the service role. In an independent local RLS check, anon inserted 3 objects with no application submitted. A trustee for whom is_admin() returned true could see them, but a DELETE removed 0 rows and all 3 objects remained. Whether this has a real shared effect depends on facts not in the repository: Storage rate limits, the plan's storage quota, and what happens at the quota (uploads refused, which would block real applicants, or billed overage). That is why it stays needs_validation. Recovery is possible, but only manually by the owner.

**Claimed root cause.** The storage.objects INSERT policy for anon checks only bucket_id='applications' and that the first folder is 'incoming' (supabase/schema.sql:476-477). Nothing binds an upload to a pending or submitted application, limits uploads per folder or in total, or expires objects that no application references. Admin policies give trustees only SELECT on the applications bucket (schema.sql:479-480), and the ALL policy covers only bucket 'files' (schema.sql:482-484), so trustees have no way to delete these objects.

**Affected boundary.** supabase/schema.sql:482 (policies "jvj admins read" / "jvj admins manage files")

### Trace
1. `src/lib/application.ts:182` (entrypoint, submitApplication): The public SPA uploads to bucket 'applications' using the public anon key. Any anon caller can make the same Storage API insert directly, without ever calling submit_application.
2. `supabase/schema.sql:476` (propagation, policy "jvj applicants upload" on storage.objects): The INSERT policy for anon and authenticated checks only (line 477) bucket_id='applications' and (storage.foldername(name))[1]='incoming'. Any name, depth or number of objects under incoming/ is accepted.
3. `supabase/schema.sql:464` (propagation, storage.buckets applications): The only limits are per object: file_size_limit 10485760 and allowed_mime_types {image/*,application/pdf}, based on the content type the client declares. There is no aggregate limit.
4. `supabase/schema.sql:298` (propagation, public.submit_application): Only paths listed in p_files are checked against a regex. Nothing requires an uploaded object to be referenced by an application, and nothing reconciles orphaned objects.
5. `supabase/schema.sql:482` (sink, policies "jvj admins read" / "jvj admins manage files"): Trustees have only SELECT on 'applications' (line 479-480). The ALL policy is limited to bucket_id='files', so orphaned applications objects stay in shared project storage and trustees cannot remove them.

### Evidence
- `supabase/schema.sql:477`: with check (bucket_id = 'applications' and (storage.foldername(name))[1] = 'incoming'): this is the only constraint on anonymous uploads.
- `supabase/schema.sql:464`: ('applications', 'applications', false, 10485760, array['image/*', 'application/pdf']): a per-object limit only.
- `supabase/schema.sql:483`: The admin ALL policy is restricted to bucket_id = 'files'. No DELETE or ALL policy covers applications-bucket objects.
- `src/portal/api.ts:261`: The portal deletes storage objects only from bucket 'files'. There is no trustee delete path for 'applications'.
- `src/lib/application.ts:174`: The client picks the upload folder (crypto.randomUUID()), so the server cannot tell a legitimate upload from an orphan.
- `agents/v4-orphan-uploads/artifacts/evidence-1.txt:1`: Independent sandboxed local RLS check (Postgres 16, repo shim + schema.sql): anon inserted 3 objects under applications/incoming with 0 application rows. A trustee with is_admin()=true saw 3 objects, but DELETE removed 0 rows and 3 remained. The shim does not model Storage API rate limits or quota.
- `agents/h2-storage/artifacts/evidence-1.txt:1`: Hunter's local check: anon inserted 501 unreferenced objects at arbitrary depth, insert outside incoming/ was denied, and no DELETE or ALL policy covers the applications bucket.

### Blockers
- The deployed Supabase project's Storage upload rate limits, per-IP throttling and any gateway or WAF limits on anon-key requests are not visible in the repository. These decide how much an anonymous caller can upload in practice.
- The plan's storage quota and what happens when it is exceeded (uploads refused for everyone, including real applicants, or billed overage, and whether the spend cap is on) are deployment and billing facts outside source. They decide whether there is a meaningful shared effect.
- Whether the deployed bucket settings match schema.sql (file_size_limit, MIME list), and whether any cleanup exists outside the repo (dashboard cron, edge function, lifecycle job), cannot be observed from source.

### Resolution plans
- **local:** Already reproduced at the RLS layer (agents/v4-orphan-uploads/artifacts/evidence-1.txt and agents/h2-storage/artifacts/evidence-1.txt). Optional extension with no network beyond loopback: start a local Supabase stack (supabase start), apply supabase/schema.sql, and use the local anon key to upload 3 small PDF objects to applications/incoming/orphan/ through the Storage REST API without calling submit_application. Then confirm 3 objects exist, no application row references them, and a trustee JWT's storage remove() on them deletes nothing. Do not load test.
- **deployment:** Owner-only, read-only checks with no load testing. In the Supabase dashboard: (1) Storage > applications: confirm the per-file size limit and MIME list match schema.sql, and count objects under incoming/ whose path is not in any applications.files entry (SQL: select count(*) from storage.objects o where bucket_id='applications' and not exists (select 1 from public.applications a, jsonb_array_elements(a.files) f where f->>'path'=o.name)). (2) Billing/Usage: record the storage quota, whether the spend cap is on, and whether uploads are refused or billed at the cap. (3) Project API/Storage settings: confirm whether any rate limit applies to anon Storage uploads. (4) Confirm whether any scheduled cleanup of applications/incoming exists outside the repository.

**Remediation status:** Uploads must go to incoming/<uuid>/<file>, ≤30 per folder, never into a folder an application uses, ≤150/hour and ≤400/day site-wide; trustees can delete applicant files and remove stale unreferenced uploads from the portal.

## Anonymous submit_application caps answers at 200 kB but leaves the files payload and application row count unbounded, enabling database bloat and unpaginated trustee-view overload

`supabase/schema.sql:submit_application:unbounded-p_files-size-and-application-row-cardinality`

public.submit_application (callable by anon) enforces pg_column_size(p_answers) <= 200000 but applies NO size bound to p_files: each array element is validated only for element count (<=30) and a path regex whose filename segment ([^/]+) and all other keys are unbounded, and the whole p_files array is stored verbatim into applications.files. A single unauthenticated RPC call therefore persists an attacker-chosen multi-megabyte row (locally reproduced: 1.12 MB from one file element carrying ~1 MB of extra keys; up to ~30x larger with the 30-element allowance). There is no source-visible per-caller rate limit and no cap on the number of application rows anon can insert. The trustee portal compounds this: loadOverview (api.ts:166) and loadApplications (api.ts:276) read c.from('applications').select('*') with only .order() and no .limit()/.range()/pagination, so every accumulated row (with its oversized files/answers jsonb) is buffered into the trustee browser on every portal load. The potential result is operator-owned database/storage quota consumption and progressively unusable trustee Applications/Overview views, both driven by minimal unauthenticated requester work.

**Claimed root cause.** Asymmetric input validation in submit_application: a byte cap exists for p_answers (schema.sql:290) but not for p_files, whose elements are only path/count-validated (schema.sql:296,298) before being persisted whole into applications.files (schema.sql:306). Combined with the anon grant on the RPC (schema.sql:452) with no source-visible rate/row-count limit, and unpaginated select('*') reads in the trustee UI (src/portal/api.ts:166,276).

**Affected boundary.** src/portal/api.ts:166 (createLiveApi.loadOverview / loadApplications (also line 276))

### Trace
1. `src/lib/application.ts:188` (entrypoint, submitApplication -> sb.rpc('submit_application')): Anonymous website visitor submits an application; any holder of the public anon key can also invoke this PostgREST RPC directly with an arbitrary p_files payload.
2. `supabase/schema.sql:290` (propagation, public.submit_application): p_answers is bounded to 200000 bytes via pg_column_size, establishing that the author knew to cap submission size.
3. `supabase/schema.sql:296` (propagation, public.submit_application): p_files is validated only as an array of at most 30 elements; no byte/size cap is applied to the array or its elements.
4. `supabase/schema.sql:298` (propagation, public.submit_application files loop): Only each element's 'path' is regex-checked (^incoming/<uuid>/[^/]+$); the [^/]+ filename segment and all other keys per element are unvalidated and unbounded.
5. `supabase/schema.sql:306` (propagation, public.submit_application insert): The entire p_files array is persisted verbatim into applications.files; no rate limit or row-count cap governs how many such rows anon may insert (grant to anon at schema.sql:452).
6. `src/portal/api.ts:166` (sink, createLiveApi.loadOverview / loadApplications (also line 276)): Trustee views read applications with select('*') and no limit/pagination, buffering every accumulated oversized row into the trustee browser on each portal load.

### Evidence
- `supabase/schema.sql:290`: p_answers byte cap: pg_column_size(p_answers) > 200000 raises 'invalid answers'.
- `supabase/schema.sql:296`: p_files guard checks only jsonb_array_length(p_files) > 30 — no byte cap.
- `supabase/schema.sql:298`: Per-element validation covers only the 'path' key via regex; the filename segment and other keys are unbounded.
- `supabase/schema.sql:306`: insert into public.applications(...) stores full p_files jsonb into the files column verbatim.
- `supabase/schema.sql:452`: grant execute on submit_application to anon, authenticated — unauthenticated reachability.
- `src/portal/api.ts:166`: loadOverview reads c.from('applications').select('*') with only .order(), no limit/pagination.
- `src/portal/api.ts:276`: loadApplications reads c.from('applications').select('*') with only .order(), no limit/pagination.
- `supabase/schema.sql:29`: public.applications table stores answers and files as jsonb (files jsonb at line 37) with no row-count or aggregate-size constraint.

### Blockers
- Request-body size limit at the deployed Supabase edge (Kong/PostgREST) is not in source; whether a ~1 MB (or ~30 MB with 30 elements) RPC body is accepted end-to-end over the network depends on that deployed cap.
- The project's deployed database/storage quota (e.g. Supabase free-tier ~500 MB) and any autoscaling are deployment facts; the number of anon calls needed to exhaust quota, and recovery (manual trustee deletion), cannot be fixed from source.
- Whether accumulated oversized rows actually render the trustee Applications/Overview views unusable depends on trustee browser memory/time behavior, a client-runtime fact not observed here.
- Presence or absence of any anonymous RPC rate limit at the Supabase Auth/edge layer is a deployed configuration fact, not visible in the repository.

### Resolution plans
- **local:** The isolated Postgres boundary check is already reproduced (agents/h7-submit-flood/artifacts/evidence-1.txt): as role anon with no JWT, a ~250 kB p_answers submission was rejected ('invalid answers'), while a submission with ONE file element whose path matched the regex and which carried ~1 MB of extra keys was ACCEPTED (reference JVJ-2026-N2K5Z), stored row = 1120240 bytes (files column 1120082 bytes). To extend: in the sandboxed local Postgres, call submit_application as anon with 30 such elements under a strict local disk/fsize limit and measure per-call persisted size and cumulative DB growth across a small bounded number of inserts, confirming size scales with attacker input with no function-level cap; and render Applications.tsx/Overview.tsx against a fixture of a few oversized rows to observe client payload size.
- **deployment:** Owner checks the Supabase project settings for any configured request body size limit and the plan's DB/storage quota, and (in staging, never production) observes database size after a bounded number of as-anon submit_application calls with large p_files, plus trustee portal load time/memory with those rows present, to establish the real exhaustion threshold, any edge body/rate cap, and the recovery path.

**Remediation status:** File entries rebuilt from six bounded fields; every path must be an uploaded object in one fresh folder; submissions pause after 15/hour or 60/day; trustee list queries capped at 500.
