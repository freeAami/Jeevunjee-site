export type Situation = '' | 'enrolled' | 'stopped' | 'never' | 'talent';

export type Answers = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  situation: Situation;
  institution: string;
  course: string;
  household: string;
  income: string;
  fundingFor: string;
  amountNeeded: string;
  story: string;
  consent: boolean;
};

export type Files = { idFile: File | null; transcriptFile: File | null };

export const emptyAnswers: Answers = {
  fullName: '', email: '', phone: '', location: '',
  situation: '',
  institution: '', course: '',
  household: '', income: '',
  fundingFor: '', amountNeeded: '',
  story: '',
  consent: false,
};

export const TOTAL_STEPS = 8;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Photos are shrunk before upload, so larger originals are fine. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// ---- draft kept on this device only (files are never stored) ----

const DRAFT_KEY = 'jvj-application-draft-v1';

export type Draft = { answers: Answers; step: number };

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    if (!d.answers || typeof d.step !== 'number') return null;
    return { answers: { ...emptyAnswers, ...d.answers, consent: false }, step: Math.min(Math.max(1, d.step), TOTAL_STEPS) };
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
  } catch {
    /* ignore */
  }
}

export function hasAnswers(a: Answers) {
  return Object.entries(a).some(([k, v]) => k !== 'consent' && typeof v === 'string' && v.trim() !== '');
}

// ---- submission ----

const ENDPOINT = import.meta.env.VITE_SUBMIT_ENDPOINT as string | undefined;

/** JVJ-2026-7KQ4M — no 0/O/1/I so it can be read back over the phone. */
export function makeReference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `JVJ-${new Date().getFullYear()}-${code}`;
}

export type SubmitResult = { reference: string; preview: boolean };

/** Phone photos are often 4–8 MB. Shrink them to ~2000px JPEG so uploads work on slow mobile data. */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file; // format the browser can't decode — send as-is
  }
}

async function encodeFile(field: keyof Files, file: File) {
  const blob = await shrinkImage(file);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const renamed = blob !== file && blob.type === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  return { field, name: renamed, type: blob.type || file.type, data };
}

/**
 * Sends the application to VITE_SUBMIT_ENDPOINT (the committee's Google Apps Script — see apps-script/SETUP.md).
 * JSON is sent as text/plain so the browser makes a "simple" request with no CORS preflight.
 * The endpoint replies `{ ok: true, reference }`. With no endpoint configured the site runs in preview mode.
 */
export async function submitApplication(answers: Answers, files: Files, honeypot = ''): Promise<SubmitResult> {
  if (!ENDPOINT) {
    await new Promise((r) => setTimeout(r, 900));
    return { reference: makeReference(), preview: true };
  }

  const encoded = await Promise.all(
    (Object.entries(files) as [keyof Files, File | null][])
      .filter((e): e is [keyof Files, File] => !!e[1])
      .map(([k, f]) => encodeFile(k, f)),
  );

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ answers, files: encoded, website: honeypot, submittedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Submission failed (${res.status})`);
  const out = (await res.json()) as { ok?: boolean; reference?: string; error?: string };
  if (!out.ok || !out.reference) throw new Error(`Submission rejected: ${out.error ?? 'unknown'}`);
  return { reference: out.reference, preview: false };
}
