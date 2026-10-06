/**
 * Jeevunjee Scholarship — application inbox.
 *
 * Lives inside the committee's Google Sheet (Extensions → Apps Script). When someone sends an application on the
 * website, the website saves it in the portal database and then pings this script with the application's reference
 * and a one-time secret. This script then:
 *   1. asks the database for that application (the database answers only once, only within an hour, and only with
 *      the right secret — so nobody can use this script to send emails or fake applications),
 *   2. adds one row to the "Applications" tab,
 *   3. emails every address in ADMIN_EMAILS,
 *   4. optionally sends the applicant a short confirmation.
 * Documents stay in the portal; nothing is saved to Drive. Daily email limits stop it ever using up the mail quota.
 *
 * Setup steps are in SETUP.md next to this file.
 */

// ---------------------------------------------------------------------------------------------------------------
// Settings — edit these.
// ---------------------------------------------------------------------------------------------------------------

/** Who is told about each new application. Put Altaf's and Imran's addresses here. */
const ADMIN_EMAILS = ['admin-one@example.com', 'admin-two@example.com'];

/** Send the applicant a short "we received it" email with their reference number (only if they gave an email). */
const SEND_APPLICANT_CONFIRMATION = true;

/** When an applicant replies to their confirmation email, it goes here. */
const REPLY_TO = ADMIN_EMAILS.join(',');

/** The trustee portal. Each email links straight to the application there. */
const PORTAL_URL = 'https://freeaami.github.io/Jeevunjee-site/#/portal/applications';

/** The portal database (public address and public key — the same ones the website uses). */
const SUPABASE_URL = 'https://qtigkjwqqkdtikqkvlgc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0aWdrandxcWtkdGlrcWt2bGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTg4MTYsImV4cCI6MjEwNjc5NDgxNn0.fVnhXr0qgRROb2xu8WGMYY4Ew0bA2ZVFIjuaNFI4kqE';

/** Safety limits per day. A small trust gets a handful of applications a week. */
const MAX_TRUSTEE_EMAILS_PER_DAY = 25;
const MAX_APPLICANT_EMAILS_PER_DAY = 20;

const SHEET_NAME = 'Applications';

// ---------------------------------------------------------------------------------------------------------------

const COLUMNS = [
  'Received', 'Reference', 'Status', 'Name', 'Email', 'Phone / WhatsApp', 'City / district', 'Situation',
  'School / programme', 'Course / discipline', 'People in household', 'Monthly income (LKR)', 'Money is for',
  'Amount that would help (LKR)', 'Their story', 'Documents', 'Committee notes',
];
const STATUSES = ['New', 'Reading', 'Asked a question', 'Approved', 'Not this time'];

/** Run this once from the editor (select "setup" → Run). It formats the sheet and asks for permissions. */
function setup() {
  const sheet = getSheet_();
  SpreadsheetApp.getActive().toast('Ready. Now deploy as a web app (see SETUP.md).', 'Jeevunjee', 8);
  return sheet.getName();
}

/** The website POSTs { reference, token } here as text/plain (so browsers don't need a CORS preflight). */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const reference = str_(body.reference);
    const token = str_(body.token);
    if (!/^JVJ-\d{4}-[A-HJ-NP-Z2-9]{5}$/.test(reference) || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      return json_({ ok: false });
    }

    // The database hands the application over once, and only to whoever holds its secret.
    const app = claim_(reference, token);
    if (!app) return json_({ ok: false });
    const a = summary_(app);

    let row;
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('busy');
    try {
      const sheet = getSheet_();
      sheet.appendRow([
        new Date(app.created_at || Date.now()), reference, 'New', cell_(a.fullName), cell_(a.email), cell_(a.phone),
        cell_(a.location), cell_(a.situation), cell_(a.institution), cell_(a.course), '', '', cell_(a.fundingFor),
        cell_(a.amountNeeded), cell_(a.story), cell_(a.documents), '',
      ]);
      row = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    // The application is safely in the database and the sheet; an email hiccup must not fail anything.
    try {
      if (allow_('trustee', MAX_TRUSTEE_EMAILS_PER_DAY)) notifyAdmins_(reference, a, row);
      else console.warn('trustee email limit reached for today; ' + reference + ' is in the sheet and the portal');
    } catch (err) { console.error('admin email failed', err); }
    try {
      if (SEND_APPLICANT_CONFIRMATION && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.email) &&
          allow_('applicant', MAX_APPLICANT_EMAILS_PER_DAY)) confirmApplicant_(reference, a);
    } catch (err) { console.error('applicant email failed', err); }

    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false });
  }
}

/** Visiting the web-app URL in a browser just confirms it is running. */
function doGet() {
  return ContentService.createTextOutput('Jeevunjee application inbox is running.');
}

/** Ask the portal database for the application. Returns null for anything that isn't a fresh, real application. */
function claim_(reference, token) {
  const res = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/claim_notification', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({ p_reference: reference, p_token: token }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    console.error('claim_notification ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    return null;
  }
  const app = JSON.parse(res.getContentText() || 'null');
  return app && app.reference === reference ? app : null;
}

/** Counts emails per day so nothing can ever use up the account's mail quota. */
function allow_(kind, max) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return false;
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'sent_' + kind + '_' + Utilities.formatDate(new Date(), 'GMT', 'yyyy-MM-dd');
    const n = Number(props.getProperty(key) || 0);
    if (n >= max) return false;
    props.setProperty(key, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

/** The fields the sheet and the emails show, built from what the database returned. */
function summary_(app) {
  const a = app.answers || {};
  const cur = str_(a.foreignCurrency) || 'GBP';
  const n = function (v) { return Number(String(v == null ? '' : v).replace(/,/g, '')) || 0; };
  const reqLkr = Math.max(0, n(a.totalFeeLkr) - n(a.selfFinancedLkr));
  const reqForeign = Math.max(0, n(a.totalFeeForeign) - n(a.selfFinancedForeign));
  const plan = (Array.isArray(a.plan) ? a.plan : []).map(function (p) {
    p = p || {};
    return (str_(p.label) || 'Payment') + (str_(p.when) ? ' (' + str_(p.when) + ')' : '') + ': Rs ' + (str_(p.amountLkr) || 0) +
      (str_(p.amountForeign) ? ' + ' + str_(p.amountForeign) + ' ' + cur : '') + ' — ' + (p.payer === 'self' ? 'family' : 'trust');
  }).join('\n');
  const edu = (Array.isArray(a.education) ? a.education : []).map(function (e) {
    e = e || {};
    return (str_(e.level) + ' ' + str_(e.year) + ': ' + str_(e.results)).trim();
  }).filter(function (x) { return x && x !== ':'; }).join('\n');
  return {
    fullName: str_(app.full_name), email: str_(app.email), phone: str_(app.phone), location: str_(a.city),
    situation: str_(a.durationYears) ? str_(a.durationYears) + '-year programme' : '',
    institution: str_(a.institution), course: str_(a.courseTitle),
    fundingFor: [str_(a.assistanceKind) && 'Kind: ' + str_(a.assistanceKind), plan].filter(Boolean).join('\n'),
    amountNeeded: 'Rs ' + reqLkr.toLocaleString('en-US') + (reqForeign ? ' + ' + reqForeign + ' ' + cur : ''),
    story: [
      str_(a.dateOfBirth) && 'Born: ' + str_(a.dateOfBirth),
      str_(a.school) && 'School: ' + str_(a.school),
      edu,
      a.hasWork === true && 'Work: ' + [str_(a.workRole), str_(a.workCompany)].filter(Boolean).join(' at '),
      str_(a.achievements) && 'Achievements: ' + str_(a.achievements),
      str_(a.ambition) && 'Ambition: ' + str_(a.ambition),
      str_(a.goals) && 'Goals: ' + str_(a.goals),
      str_(a.familySituation) && 'Family: ' + str_(a.familySituation),
      str_(a.signatureName) && 'Signed: ' + str_(a.signatureName),
    ].filter(Boolean).join('\n\n'),
    documents: (Number(app.file_count) || 0) + ' file(s) — open them in the trustee portal',
  };
}

// ---------------------------------------------------------------------------------------------------------------

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAME, 0);
  sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS])
    .setFontWeight('bold').setBackground('#F1EDE1').setFontColor('#111111');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);
  sheet.getRange('A:A').setNumberFormat('d mmm yyyy, h:mm');
  sheet.getRange('M:O').setWrap(true);
  [150, 130, 130, 170, 200, 140, 130, 220, 200, 180, 90, 110, 260, 110, 420, 180, 260]
    .forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });

  const status = sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1);
  status.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).build());
  const colour = function (text, bg) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(text).setBackground(bg).setRanges([status]).build();
  };
  sheet.setConditionalFormatRules([
    colour('New', '#FCE8B2'), colour('Reading', '#E8EEF7'), colour('Asked a question', '#F3E5F5'),
    colour('Approved', '#DDEBD5'), colour('Not this time', '#EEEEEE'),
  ]);

  const blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0) ss.deleteSheet(blank);
  return sheet;
}

function notifyAdmins_(reference, a, row) {
  const ss = SpreadsheetApp.getActive();
  const sheet = getSheet_();
  const rowUrl = ss.getUrl() + '#gid=' + sheet.getSheetId() + '&range=A' + row;
  const line = function (label, value) {
    return value ? '<tr><td style="padding:6px 16px 6px 0;color:#6F6F6F;vertical-align:top;white-space:nowrap">' + label +
      '</td><td style="padding:6px 0;color:#111">' + esc_(value).replace(/\n/g, '<br>') + '</td></tr>' : '';
  };
  const button = function (href, text, dark) {
    return '<a href="' + href + '" style="display:inline-block;padding:12px 22px;margin:0 8px 8px 0;border-radius:999px;' +
      'text-decoration:none;font-size:14px;' + (dark ? 'background:#111;color:#FDFCF8' : 'border:1px solid #B08D3A;color:#8A6A22') +
      '">' + text + '</a>';
  };
  const html =
    '<div style="font-family:Georgia,serif;font-size:26px;color:#111;margin-bottom:4px">New application — ' + esc_(a.fullName) + '</div>' +
    '<div style="font-family:Arial,sans-serif;font-size:13px;color:#6F6F6F;margin-bottom:20px">Reference ' + reference + '</div>' +
    '<div style="margin-bottom:20px">' + button(PORTAL_URL, 'Open in the trustee portal', true) +
    button(rowUrl, 'Open in the sheet', false) + '</div>' +
    '<table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;border-collapse:collapse">' +
    line('Situation', a.situation) +
    line('Email', a.email) + line('Phone / WhatsApp', a.phone) + line('City / district', a.location) +
    line('School / programme', a.institution) + line('Course / discipline', a.course) +
    line('Money is for', a.fundingFor) + line('Amount that would help', a.amountNeeded) +
    line('Their story', a.story) +
    '</table>' +
    '<p style="font-family:Arial,sans-serif;font-size:12px;color:#948C7C;margin-top:24px">Documents are not attached to this email on purpose — they stay in the trustee portal.</p>';

  MailApp.sendEmail({
    to: ADMIN_EMAILS.join(','),
    subject: 'New scholarship application — ' + line_(a.fullName).slice(0, 80) + ' (' + reference + ')',
    htmlBody: html,
    replyTo: str_(a.email) || REPLY_TO,
    name: 'Jeevunjee Scholarship',
  });
}

function confirmApplicant_(reference, a) {
  const first = str_(a.fullName).split(/\s+/)[0];
  MailApp.sendEmail({
    to: str_(a.email),
    subject: 'We received your application — ' + reference,
    name: 'Jeevunjee Scholarship',
    replyTo: REPLY_TO,
    htmlBody:
      '<div style="font-family:Georgia,serif;font-size:24px;color:#111;margin-bottom:16px">Thank you, ' + esc_(first) + '.</div>' +
      '<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3A362D">Your application has come through. ' +
      'The Committee will read what you shared carefully and write to you — whether it is a yes, a no, or a question.</p>' +
      '<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3A362D">Your reference number is ' +
      '<strong style="letter-spacing:0.06em">' + reference + '</strong>. Keep it — it is how you write to us, and how we find your file quickly.</p>' +
      '<p style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#3A362D">You can reply to this email if you need to tell us anything else.</p>' +
      '<p style="font-family:Georgia,serif;font-size:18px;color:#111;margin-top:24px">— The Jeevunjee family</p>',
  });
}

/** Text from outside: no control characters except new lines and tabs, trimmed, capped. */
function str_(v) { return v == null || typeof v === 'object' ? '' : String(v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, 20000); }
/** One line (for email subjects). */
function line_(v) { return str_(v).replace(/\s+/g, ' '); }
/** Text for a sheet cell. A leading = + - @ (even after invisible characters) would otherwise be run as a formula. */
function cell_(v) { const t = str_(v).replace(/^[\s\u200B-\u200F\u2060\uFEFF]+/, ''); return /^[=+\-@]/.test(t) ? "'" + t : t; }
function esc_(v) { return str_(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
