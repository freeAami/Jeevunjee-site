/**
 * Jeevunjee Scholarship — application inbox.
 *
 * Lives inside the committee's Google Sheet (Extensions → Apps Script). Each application from the website:
 *   1. becomes one row in the "Applications" tab,
 *   2. has its documents saved to a private Google Drive folder (only people the folder is shared with can open it),
 *   3. is emailed to every address in ADMIN_EMAILS with a button that opens the sheet,
 *   4. optionally gets a short confirmation email sent to the applicant.
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

/** When an applicant replies to their confirmation email, it goes to the admins. */
const REPLY_TO = ADMIN_EMAILS.join(',');

const SHEET_NAME = 'Applications';
const FOLDER_NAME = 'Jeevunjee applications — documents (private)';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------------------------

const COLUMNS = [
  'Received', 'Reference', 'Status', 'Name', 'Email', 'Phone / WhatsApp', 'City / district', 'Situation',
  'School / programme', 'Course / discipline', 'People in household', 'Monthly income (LKR)', 'Money is for',
  'Amount that would help (LKR)', 'Their story', 'Documents', 'Committee notes',
];
const STATUSES = ['New', 'Reading', 'Asked a question', 'Approved', 'Not this time'];
const SITUATIONS = {
  enrolled: 'In school/university — worried about continuing',
  stopped: 'Had to stop — wants to return',
  never: 'Never had a proper chance to go',
  talent: 'Developing a talent',
};

/** Run this once from the editor (select "setup" → Run). It formats the sheet and asks for permissions. */
function setup() {
  const sheet = getSheet_();
  getFolder_();
  SpreadsheetApp.getActive().toast('Ready. Now deploy as a web app (see SETUP.md).', 'Jeevunjee', 8);
  return sheet.getName();
}

/** The website POSTs here. Body is JSON sent as text/plain (so browsers don't need a CORS preflight). */
function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    // Honeypot: real people never fill the hidden "website" field. Pretend success so bots don't retry.
    if (body.website) return json_({ ok: true, reference: 'JVJ-0000-00000' });

    const a = body.answers || {};
    if (!str_(a.fullName) || !(str_(a.email) || str_(a.phone)) || a.consent !== true) {
      return json_({ ok: false, error: 'missing-fields' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    let reference, row, folderUrl;
    try {
      const sheet = getSheet_();
      reference = newReference_(sheet);
      folderUrl = saveFiles_(reference, a.fullName, body.files || []);
      sheet.appendRow([
        new Date(), reference, 'New', cell_(a.fullName), cell_(a.email), cell_(a.phone), cell_(a.location),
        SITUATIONS[a.situation] || cell_(a.situation), cell_(a.institution), cell_(a.course), cell_(a.household),
        cell_(a.income), cell_(a.fundingFor), cell_(a.amountNeeded), cell_(a.story), folderUrl, '',
      ]);
      row = sheet.getLastRow();
    } finally {
      lock.releaseLock();
    }

    // The application is safely in the sheet now; an email hiccup must not make the applicant send it twice.
    try { notifyAdmins_(reference, a, row, folderUrl); } catch (err) { console.error('admin email failed', err); }
    try {
      if (SEND_APPLICANT_CONFIRMATION && str_(a.email)) confirmApplicant_(reference, a);
    } catch (err) { console.error('applicant email failed', err); }

    return json_({ ok: true, reference: reference });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server-error' });
  }
}

/** Visiting the web-app URL in a browser just confirms it is running. */
function doGet() {
  return ContentService.createTextOutput('Jeevunjee application inbox is running.');
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

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted — make a new one */ }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

/** Saves uploaded documents into a sub-folder per applicant. Returns the folder link ('' if no files). */
function saveFiles_(reference, name, files) {
  const valid = files.filter(function (f) { return f && f.data; });
  if (!valid.length) return '';
  const folder = getFolder_().createFolder(reference + ' — ' + str_(name).slice(0, 60));
  valid.forEach(function (f) {
    const bytes = Utilities.base64Decode(f.data);
    if (bytes.length > MAX_FILE_BYTES) return;
    const type = /^(image\/|application\/pdf$)/.test(f.type) ? f.type : 'application/octet-stream';
    const label = f.field === 'idFile' ? 'ID' : f.field === 'transcriptFile' ? 'School record' : 'Document';
    folder.createFile(Utilities.newBlob(bytes, type, label + ' — ' + str_(f.name).slice(0, 80)));
  });
  return folder.getUrl();
}

/** JVJ-2026-7KQ4M, unique within the sheet. No 0/O/1/I so it can be read out over the phone. */
function newReference_(sheet) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const existing = sheet.getLastRow() > 1
    ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().map(function (r) { return r[0]; })
    : [];
  let ref;
  do {
    let code = '';
    for (let i = 0; i < 5; i++) code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    ref = 'JVJ-' + new Date().getFullYear() + '-' + code;
  } while (existing.indexOf(ref) !== -1);
  return ref;
}

function notifyAdmins_(reference, a, row, folderUrl) {
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
    '<div style="margin-bottom:20px">' + button(rowUrl, 'Open in the applications sheet', true) +
    (folderUrl ? button(folderUrl, 'View documents', false) : '') + '</div>' +
    '<table style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;border-collapse:collapse">' +
    line('Situation', SITUATIONS[a.situation] || a.situation) +
    line('Email', a.email) + line('Phone / WhatsApp', a.phone) + line('City / district', a.location) +
    line('School / programme', a.institution) + line('Course / discipline', a.course) +
    line('Household', a.household) + line('Monthly income (LKR)', a.income) +
    line('Money is for', a.fundingFor) + line('Amount that would help', a.amountNeeded) +
    line('Their story', a.story) +
    '</table>' +
    '<p style="font-family:Arial,sans-serif;font-size:12px;color:#948C7C;margin-top:24px">Documents are not attached to this email on purpose — they stay in the private Drive folder.</p>';

  MailApp.sendEmail({
    to: ADMIN_EMAILS.join(','),
    subject: 'New scholarship application — ' + str_(a.fullName) + ' (' + reference + ')',
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

function str_(v) { return v == null ? '' : String(v).trim().slice(0, 20000); }
/** Text for a sheet cell. A leading = + - @ would otherwise be run as a formula. */
function cell_(v) { const t = str_(v); return /^[=+\-@]/.test(t) ? "'" + t : t; }
function esc_(v) { return str_(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
