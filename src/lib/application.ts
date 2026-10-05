// The scholarship application: what the journey collects (mirrors the Trust's paper "Scholarship for Education"
// form), the on-device draft, and sending it to the portal database.
import { finalName, safeFileName, shrinkImage, shrinkPhoto } from './files';
import { getSupabase, supabaseConfigured } from './supabase';

export type EducationRecord = { id: string; level: string; school: string; year: string; results: string };
export type PlanRow = { id: string; label: string; when: string; amountLkr: string; amountForeign: string; payer: 'trust' | 'self' };

export type Answers = {
  // Profile
  fullName: string;
  dateOfBirth: string;
  phone: string;
  email: string;
  city: string;
  // Education & experience
  school: string;
  education: EducationRecord[];
  achievements: string;
  hasWork: boolean;
  workCompany: string;
  workRole: string;
  workSkills: string;
  // Future plans
  ambition: string;
  goals: string;
  // Programme & finances
  courseTitle: string;
  institution: string;
  awardingBody: string;
  durationYears: string;
  paymentFrequency: string;
  startMonth: string;
  totalFeeLkr: string;
  totalFeeForeign: string;
  foreignCurrency: string;
  selfFinancedLkr: string;
  selfFinancedForeign: string;
  assistanceKind: '' | 'grant' | 'loan' | 'either';
  plan: PlanRow[];
  familySituation: string;
  // Sign-off
  declTruthful: boolean;
  declWilling: boolean;
  declInterview: boolean;
  signatureName: string;
};

/** Files are kept in memory only (never in the draft). Education certificates are keyed by record id. */
export type Files = { photo: File | null; idFile: File | null; feeSchedule: File | null; incomeProof: File | null; edu: Record<string, File | null> };

export const newId = () => crypto.randomUUID().slice(0, 8);

export const emptyAnswers = (): Answers => ({
  fullName: '', dateOfBirth: '', phone: '', email: '', city: '',
  school: '', education: [{ id: newId(), level: '', school: '', year: '', results: '' }], achievements: '',
  hasWork: false, workCompany: '', workRole: '', workSkills: '',
  ambition: '', goals: '',
  courseTitle: '', institution: '', awardingBody: '', durationYears: '', paymentFrequency: '', startMonth: '',
  totalFeeLkr: '', totalFeeForeign: '', foreignCurrency: 'GBP', selfFinancedLkr: '', selfFinancedForeign: '',
  assistanceKind: '', plan: [{ id: newId(), label: '', when: '', amountLkr: '', amountForeign: '', payer: 'trust' }],
  familySituation: '',
  declTruthful: false, declWilling: false, declInterview: false, signatureName: '',
});

export const emptyFiles = (): Files => ({ photo: null, idFile: null, feeSchedule: null, incomeProof: null, edu: {} });

export const toNumber = (s: string) => Number(String(s).replace(/,/g, '')) || 0;

/** What the applicant is asking the trust for: total minus what the family covers, per currency. */
export function requested(a: Answers) {
  return {
    lkr: Math.max(0, toNumber(a.totalFeeLkr) - toNumber(a.selfFinancedLkr)),
    foreign: Math.max(0, toNumber(a.totalFeeForeign) - toNumber(a.selfFinancedForeign)),
  };
}

// ---- draft kept on this device only (files are never stored) ----

const DRAFT_KEY = 'jvj-application-draft-v2';
export type Draft = { answers: Answers; scene: number };

export function loadDraft(total: number): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d.answers || typeof d.scene !== 'number') return null;
    const answers = { ...emptyAnswers(), ...d.answers, declTruthful: false, declWilling: false, declInterview: false };
    return { answers, scene: Math.min(Math.max(1, d.scene), total) };
  } catch {
    return null;
  }
}

export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode / storage full — the journey still works, it just won't resume */
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem('jvj-application-draft-v1');
  } catch {
    /* ignore */
  }
}

export function hasAnswers(a: Answers) {
  return Boolean(a.fullName.trim() || a.email.trim() || a.phone.trim() || a.ambition.trim() || a.courseTitle.trim());
}

// ---- submission ----

/** The committee's Apps Script: emails the trustees about each new application. */
const NOTIFY_ENDPOINT =
  (import.meta.env.VITE_SUBMIT_ENDPOINT as string | undefined) ??
  'https://script.google.com/macros/s/AKfycbwynuoB0ZnrmneUaPrjJofmxFlg9fS0zmq3xveX-tQktm3k8j_1IPGeZNR2xsjfW8VS/exec';

/** JVJ-2026-7KQ4M — no 0/O/1/I so it can be read back over the phone. Only used in preview mode. */
function previewReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => alphabet[b % 32]).join('');
  return `JVJ-${new Date().getFullYear()}-${code}`;
}

export type SubmitResult = { reference: string; preview: boolean };
export type Progress = (done: number, total: number) => void;

type Upload = { field: string; label: string; file: File };

function uploadsFor(a: Answers, f: Files): Upload[] {
  const list: Upload[] = [];
  if (f.photo) list.push({ field: 'photo', label: 'Passport photo', file: f.photo });
  if (f.idFile) list.push({ field: 'idFile', label: 'ID / birth certificate', file: f.idFile });
  for (const e of a.education) {
    const file = f.edu[e.id];
    if (file) list.push({ field: `edu:${e.id}`, label: `${`${e.level} ${e.year}`.trim() || 'Education'} — certificate`, file });
  }
  if (f.feeSchedule) list.push({ field: 'feeSchedule', label: 'Course details / fee schedule', file: f.feeSchedule });
  if (f.incomeProof) list.push({ field: 'incomeProof', label: 'Family income proof', file: f.incomeProof });
  return list;
}

/** Keep only education rows and plan rows that have something in them. */
function tidy(a: Answers): Answers {
  return {
    ...a,
    education: a.education.filter((e) => e.level || e.year || e.results || e.school),
    plan: a.plan.filter((p) => p.label || p.amountLkr || p.amountForeign || p.when),
  };
}

/**
 * Sends the application to the portal database (Supabase): files first (into a private bucket only the
 * trustees can read), then the answers. The trustees are then emailed through the Apps Script.
 */
export async function submitApplication(raw: Answers, files: Files, honeypot = '', onProgress?: Progress): Promise<SubmitResult> {
  const answers = { ...tidy(raw), signedOn: new Date().toISOString().slice(0, 10) };
  if (honeypot) return { reference: previewReference(), preview: false }; // bots get a fake success

  if (!supabaseConfigured) {
    // Until the portal database is connected, keep sending applications to the committee's Google Sheet.
    if (NOTIFY_ENDPOINT) return submitToSheet(answers, uploadsFor(raw, files), onProgress);
    await new Promise((r) => setTimeout(r, 900));
    return { reference: previewReference(), preview: true };
  }

  const sb = await getSupabase();
  const folder = crypto.randomUUID();
  const uploads = uploadsFor(raw, files);
  const sent: { field: string; label: string; name: string; path: string; mime: string; size: number }[] = [];
  onProgress?.(0, uploads.length + 1);
  for (const [i, u] of uploads.entries()) {
    const blob = u.field === 'photo' ? await shrinkPhoto(u.file) : await shrinkImage(u.file);
    const name = finalName(u.file, blob);
    const path = `incoming/${folder}/${u.field.replace(/[^a-z0-9]+/gi, '-')}-${safeFileName(name)}`;
    const { error } = await sb.storage.from('applications').upload(path, blob, { contentType: blob.type || u.file.type, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    sent.push({ field: u.field, label: u.label, name, path, mime: blob.type || u.file.type, size: blob.size });
    onProgress?.(i + 1, uploads.length + 1);
  }

  const { data, error } = await sb.rpc('submit_application', { p_answers: answers, p_files: sent });
  if (error || !data) throw new Error(error?.message ?? 'Submission failed');
  onProgress?.(uploads.length + 1, uploads.length + 1);
  notifyTrustees(answers, data as string);
  return { reference: data as string, preview: false };
}

function sheetSummary(a: Answers) {
  const req = requested(a);
  const plan = a.plan
    .map((p) => `${p.label || 'Payment'}${p.when ? ` (${p.when})` : ''}: Rs ${p.amountLkr || 0}${p.amountForeign ? ` + ${p.amountForeign} ${a.foreignCurrency}` : ''} — ${p.payer === 'self' ? 'family' : 'trust'}`)
    .join('\n');
  return {
    fullName: a.fullName, email: a.email, phone: a.phone, location: a.city,
    situation: a.durationYears ? `${a.durationYears}-year programme` : '',
    institution: a.institution, course: a.courseTitle, household: '', income: '',
    fundingFor: [a.assistanceKind && `Kind: ${a.assistanceKind}`, plan].filter(Boolean).join('\n'),
    amountNeeded: `Rs ${req.lkr.toLocaleString('en-LK')}${req.foreign ? ` + ${req.foreign} ${a.foreignCurrency}` : ''}`,
    story: [
      a.dateOfBirth && `Born: ${a.dateOfBirth}`,
      a.school && `School: ${a.school}`,
      a.education.filter((e) => e.level || e.results).map((e) => `${e.level} ${e.year}: ${e.results}`).join('\n'),
      a.hasWork && `Work: ${[a.workRole, a.workCompany].filter(Boolean).join(' at ')}${a.workSkills ? ` (${a.workSkills})` : ''}`,
      a.achievements && `Achievements: ${a.achievements}`,
      `Ambition: ${a.ambition}`,
      a.goals && `Goals: ${a.goals}`,
      `Total fee: Rs ${a.totalFeeLkr || 0}${a.totalFeeForeign ? ` + ${a.totalFeeForeign} ${a.foreignCurrency}` : ''}; family covers Rs ${a.selfFinancedLkr || 0}${a.selfFinancedForeign ? ` + ${a.selfFinancedForeign} ${a.foreignCurrency}` : ''}`,
      `Family: ${a.familySituation}`,
      `Signed: ${a.signatureName}`,
    ].filter(Boolean).join('\n\n'),
    consent: true,
  };
}

/** Best-effort email to the trustees via their Apps Script. Never blocks or fails the application. */
function notifyTrustees(a: Answers, reference: string) {
  if (!NOTIFY_ENDPOINT) return;
  const summary = sheetSummary(a);
  fetch(NOTIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ answers: summary, files: [], website: '', reference, submittedAt: new Date().toISOString() }),
    keepalive: true,
  }).catch(() => {});
}

/** Fallback while Supabase isn't connected: the whole application, files included, goes to the Apps Script. */
async function submitToSheet(a: Answers, uploads: Upload[], onProgress?: Progress): Promise<SubmitResult> {
  onProgress?.(0, uploads.length + 1);
  const files = [];
  for (const [i, u] of uploads.entries()) {
    const blob = u.field === 'photo' ? await shrinkPhoto(u.file) : await shrinkImage(u.file);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    // The script files the ID under "idFile" and anything else under "Document".
    files.push({ field: u.field === 'idFile' ? 'idFile' : u.field === 'photo' ? 'photo' : 'other', name: `${u.label} — ${finalName(u.file, blob)}`, type: blob.type || u.file.type, data });
    onProgress?.(i + 1, uploads.length + 1);
  }
  const res = await fetch(NOTIFY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ answers: sheetSummary(a), files, website: '', submittedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Submission failed (${res.status})`);
  const out = (await res.json()) as { ok?: boolean; reference?: string; error?: string };
  if (!out.ok || !out.reference) throw new Error(`Submission rejected: ${out.error ?? 'unknown'}`);
  return { reference: out.reference, preview: false };
}
