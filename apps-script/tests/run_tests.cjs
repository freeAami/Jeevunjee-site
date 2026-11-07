// Runs the real Code.gs against stand-ins for Google services (no network). Usage: node apps-script/tests/run_tests.cjs
const vm = require('vm'), fs = require('fs');
const mails = [], rows = [], props = {}; let claims = {}; let digest = null, digestAsk = null;
const ctx = {
  console, JSON, Date, Number, String, Array, Math, Object, RegExp,
  ContentService: { createTextOutput: (t) => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: { formatDate: () => '2026-10-06' },
  MailApp: { sendEmail: (m) => mails.push(m) },
  UrlFetchApp: { fetch: (url, o) => { const b = JSON.parse(o.payload);
    if (url.endsWith('/rpc/mailer_digest')) { digestAsk = b; const d = b.p_key === props.MAILER_KEY ? digest : null; digest = null;
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(d) }; }
    const a = claims[b.p_reference + '|' + b.p_token];
    delete claims[b.p_reference + '|' + b.p_token]; return { getResponseCode: () => 200, getContentText: () => JSON.stringify(a ?? null) }; } },
  SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet, getUrl: () => 'https://sheet' }) },
};
const sheet = { appendRow: (r) => rows.push(r), getLastRow: () => rows.length + 1, getSheetId: () => 1, getName: () => 'Applications' };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8'), ctx);
const post = (b) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(b) } }).t);
const tok = 'a'.repeat(64), ref = 'JVJ-2026-ABCDE';
const app = { reference: ref, created_at: '2026-10-06T10:00:00Z', full_name: '=HYPERLINK("x")', email: 'applicant@example.org', phone: '077',
  answers: { city: 'Kandy', courseTitle: 'BSc', plan: [{ label: 'Y1', amountLkr: '1000', payer: 'trust' }], totalFeeLkr: '1000' }, file_count: 2 };
claims[ref + '|' + tok] = app;
const t = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) process.exitCode = 1; }
t('forged request without token rejected', post({ reference: ref }).ok === false && mails.length === 0);
t('wrong token rejected, nothing sent', post({ reference: ref, token: 'b'.repeat(64) }).ok === false && mails.length === 0 && rows.length === 0);
t('real application: 1 row, trustee + applicant mail', post({ reference: ref, token: tok }).ok === true && rows.length === 1 && mails.length === 2);
t('formula in name neutralised', String(rows[0][3]).startsWith("'="));
t('replay rejected', post({ reference: ref, token: tok }).ok === false && mails.length === 2);
for (let i = 0; i < 40; i++) { const r = 'JVJ-2026-' + 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.slice(i % 27, i % 27 + 5); claims[r + '|' + tok] = { ...app, reference: r }; post({ reference: r, token: tok }); }
const trustee = mails.filter((m) => m.to.includes('admin-one')).length, applicant = mails.length - trustee;
t(`daily caps hold (trustee ${trustee} ≤ 25, applicant ${applicant} ≤ 20)`, trustee <= 25 && applicant <= 20);
t('every application still lands in the sheet', rows.length === 41);

// --- hourly mailer: payment reminders and new-trustee emails ---
const before = mails.length;
digest = { reminders: [{ kind: 'week', name: 'Remind Me', email: 'r@example.org', code: 'S-001', label: 'Year 1', due_date: '2026-10-10', amount_lkr: 1000 }], new_trustees: [], trustee_emails: [] };
ctx.hourlyMail();
t('no MAILER_KEY: nothing asked, nothing sent', digestAsk === null && mails.length === before);
props.MAILER_KEY = 'c'.repeat(64);
digest = {
  reminders: [
    { kind: 'week', name: 'Remind Me', email: 'r@example.org', code: 'S-001', label: 'Year 1 <b>', due_date: '2026-10-10', amount_lkr: 250000, funded_by: 'trust', course: 'BSc', institution: 'SLIIT' },
    { kind: 'overdue', name: 'Late One', email: 'late@example.org', code: 'S-002', label: 'Sem 2', due_date: '2026-10-01', amount_lkr: 0, funded_by: 'self' },
    { kind: 'day', name: 'No Mail', email: 'not-an-email', code: 'S-003', label: 'Sem 1', due_date: '2026-10-07' },
  ],
  new_trustees: [{ name: 'New <Trustee>', email: 'new@example.org' }],
  trustee_emails: ['t1@example.org', 't2@example.org', 'bad'],
};
ctx.hourlyMail();
const sent = mails.slice(before);
t('mailer sends its key and asks for no more than the daily room', digestAsk.p_key === props.MAILER_KEY && digestAsk.p_max === 40);
t('each student with a real email gets one reminder', sent.filter((m) => m.to === 'r@example.org').length === 1 && sent.filter((m) => m.to === 'late@example.org').length === 1 && !sent.some((m) => m.to === 'not-an-email'));
t('overdue reminder says so', /Overdue/.test(sent.find((m) => m.to === 'late@example.org').subject));
t('reminder text is escaped', !sent.find((m) => m.to === 'r@example.org').htmlBody.includes('<b>'));
const ann = sent.find((m) => m.to.includes('t1@example.org'));
t('other trustees are told about the new one', ann && ann.to === 't1@example.org,t2@example.org' && /New/.test(ann.subject) && !ann.htmlBody.includes('<Trustee>'));
const n = mails.length; digest = { reminders: [], new_trustees: [], trustee_emails: [] }; ctx.hourlyMail();
t('nothing new, nothing sent', mails.length === n);
props.MAILER_KEY = 'nope'; digestAsk = null; ctx.hourlyMail();
t('a malformed key is never sent', digestAsk === null);
