import type { SupabaseClient } from '@supabase/supabase-js';
import { finalName, safeFileName, shrinkImage, shrinkPhoto } from '../lib/files';
import { getSupabase } from '../lib/supabase';
import type {
  Application, Course, DocCategory, DocumentRec, Instalment, Note, Overview, Payment, Profile, Student, StudentBundle,
  Trust,
} from './types';

export type Session = { userId: string; email: string };

type New<T> = Partial<T> & { id?: string };

export interface PortalApi {
  mode: 'live' | 'demo';
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (event: string) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, accessCode: string): Promise<void>;
  signOut(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getProfile(): Promise<Profile | null>;

  loadOverview(): Promise<Overview>;
  loadStudent(id: string): Promise<StudentBundle>;
  saveStudent(s: New<Student>): Promise<Student>;
  setStudentPhoto(studentId: string, file: File): Promise<void>;
  saveCourse(c: New<Course>): Promise<Course>;
  deleteCourse(id: string): Promise<void>;
  saveInstalment(i: New<Instalment>): Promise<Instalment>;
  deleteInstalment(id: string): Promise<void>;
  savePayment(p: New<Payment>, settleInstalment: boolean): Promise<void>;
  deletePayment(id: string): Promise<void>;
  uploadDocument(studentId: string, file: File, category: DocCategory, title: string, asRole: 'admin' | 'student'): Promise<void>;
  deleteDocument(doc: DocumentRec): Promise<void>;
  fileUrl(bucket: string, path: string): Promise<string>;
  addNote(studentId: string, body: string, authorName: string): Promise<void>;
  deleteNote(id: string): Promise<void>;
  issueAccessCode(studentId: string): Promise<string>;
  loadApplications(): Promise<Application[]>;
  updateApplication(id: string, patch: Partial<Pick<Application, 'status' | 'review_notes'>>): Promise<void>;
  enrolApplication(id: string, trustId: string): Promise<string>;
  /** Deletes an application that was not enrolled, with every file it uploaded. */
  deleteApplication(app: Application): Promise<void>;
  /** Applicant uploads that never became an application (older than a day). */
  countUnusedUploads(): Promise<number>;
  removeUnusedUploads(): Promise<number>;
}

/** Turn database errors into sentences a trustee or student can act on. */
export function friendlyError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/Database error saving new user|JVJ_SIGNUP_NOT_ALLOWED/i.test(msg))
    return 'That code doesn’t work with this email. It may have expired or already been used, or it was made for a different email address. Ask for a new code.';
  if (/Invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check them and try again.';
  if (/already registered|already been registered/i.test(msg)) return 'An account with this email already exists — sign in instead.';
  if (/Password should be at least/i.test(msg)) return 'Please choose a password of at least 8 characters.';
  if (/Email not confirmed/i.test(msg)) return 'This account still needs its email confirmed. Ask the site administrator to turn off email confirmation in Supabase (see the setup guide).';
  if (/rate limit/i.test(msg)) return 'Too many attempts — please wait a minute and try again.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Couldn’t reach the server. Check your internet connection and try again.';
  if (/row-level security|permission denied|not allowed/i.test(msg)) return 'You don’t have permission to do that.';
  return msg;
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw new Error((res.error as { message?: string }).message ?? 'Something went wrong');
  return res.data;
}

/** For calls whose result we don't need: just surface the error. */
function ensure(res: { error: unknown }) {
  if (res.error) throw new Error((res.error as { message?: string }).message ?? 'Something went wrong');
}

const num = <T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T => {
  const out = { ...row };
  for (const k of keys) if (out[k] != null) (out as Record<keyof T, unknown>)[k] = Number(out[k]);
  return out;
};
const courseNums: (keyof Course)[] = ['total_fee_lkr', 'total_fee_foreign', 'duration_years'];
const instNums: (keyof Instalment)[] = ['amount_lkr', 'amount_foreign'];
const payNums: (keyof Payment)[] = ['amount_lkr', 'amount_foreign', 'fx_rate', 'total_lkr'];

/** Drop read-only columns and turn empty strings into nulls before writing. */
function clean<T extends Record<string, unknown>>(row: T, readOnly: string[] = []) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (['created_at', 'updated_at', 'total_lkr', 'code', ...readOnly].includes(k)) continue;
    out[k] = v === '' ? null : v;
  }
  if (!out.id) delete out.id;
  return out;
}

export function createLiveApi(): PortalApi {
  const sb = () => getSupabase();
  const withSb = async <T>(fn: (c: SupabaseClient) => Promise<T>) => fn(await sb());

  const uploadTo = async (c: SupabaseClient, studentId: string, file: File, photo = false) => {
    const blob = photo ? await shrinkPhoto(file) : await shrinkImage(file);
    const name = finalName(file, blob);
    const path = `students/${studentId}/${crypto.randomUUID()}-${safeFileName(name)}`;
    check(await c.storage.from('files').upload(path, blob, { contentType: blob.type || file.type, upsert: false }));
    return { path, name, mime: blob.type || file.type, size: blob.size };
  };

  return {
    mode: 'live',

    getSession: () =>
      withSb(async (c) => {
        const { data } = await c.auth.getSession();
        const u = data.session?.user;
        return u ? { userId: u.id, email: u.email ?? '' } : null;
      }),

    onAuthChange(cb) {
      let unsub = () => {};
      sb().then((c) => {
        const { data } = c.auth.onAuthStateChange((event) => cb(event));
        unsub = () => data.subscription.unsubscribe();
      });
      return () => unsub();
    },

    signIn: (email, password) =>
      withSb(async (c) => {
        ensure(await c.auth.signInWithPassword({ email: email.trim(), password }));
      }),

    signUp: (email, password, accessCode) =>
      withSb(async (c) => {
        const res = await c.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { access_code: accessCode.trim() } },
        });
        ensure(res);
        if (!res.data.session) {
          // Email confirmation is still switched on in Supabase; try signing straight in so the
          // user sees the clear "needs confirming" message rather than nothing.
          ensure(await c.auth.signInWithPassword({ email: email.trim(), password }));
        }
      }),

    signOut: () => withSb(async (c) => void (await c.auth.signOut())),

    sendPasswordReset: (email) =>
      withSb(async (c) => {
        const redirectTo = `${location.origin}${location.pathname}#/portal`;
        ensure(await c.auth.resetPasswordForEmail(email.trim(), { redirectTo }));
      }),

    updatePassword: (password) => withSb(async (c) => ensure(await c.auth.updateUser({ password }))),

    getProfile: () =>
      withSb(async (c) => {
        const { data: u } = await c.auth.getUser();
        if (!u.user) return null;
        return check(await c.from('profiles').select('*').eq('id', u.user.id).maybeSingle()) as Profile | null;
      }),

    loadOverview: () =>
      withSb(async (c) => {
        const [trusts, students, courses, instalments, payments, applications] = await Promise.all([
          c.from('trusts').select('id, name').order('name'),
          c.from('students').select('*').order('full_name'),
          c.from('courses').select('*'),
          c.from('instalments').select('*').order('due_date', { nullsFirst: false }),
          c.from('payments').select('*').order('paid_on', { ascending: false }),
          c.from('applications').select('*').order('created_at', { ascending: false }).limit(500),
        ]);
        return {
          trusts: check(trusts) as Trust[],
          students: check(students) as Student[],
          courses: (check(courses) as Course[]).map((r) => num(r, courseNums)),
          instalments: (check(instalments) as Instalment[]).map((r) => num(r, instNums)),
          payments: (check(payments) as Payment[]).map((r) => num(r, payNums)),
          applications: check(applications) as Application[],
        };
      }),

    loadStudent: (id) =>
      withSb(async (c) => {
        const [student, courses, instalments, payments, documents, notes, logins, trusts] = await Promise.all([
          c.from('students').select('*').eq('id', id).single(),
          c.from('courses').select('*').eq('student_id', id).order('start_date', { nullsFirst: false }),
          c.from('instalments').select('*').eq('student_id', id).order('due_date', { nullsFirst: false }),
          c.from('payments').select('*').eq('student_id', id).order('paid_on', { ascending: false }),
          c.from('documents').select('*').eq('student_id', id).order('created_at', { ascending: false }),
          c.from('notes').select('*').eq('student_id', id).order('created_at', { ascending: false }),
          c.from('profiles').select('*').eq('student_id', id),
          c.from('trusts').select('id, name').order('name'),
        ]);
        return {
          student: check(student) as Student,
          courses: (check(courses) as Course[]).map((r) => num(r, courseNums)),
          instalments: (check(instalments) as Instalment[]).map((r) => num(r, instNums)),
          payments: (check(payments) as Payment[]).map((r) => num(r, payNums)),
          documents: check(documents) as DocumentRec[],
          // Students can't read notes or other logins; those queries simply return nothing for them.
          notes: (notes.data ?? []) as Note[],
          logins: (logins.data ?? []) as Profile[],
          trusts: check(trusts) as Trust[],
        };
      }),

    saveStudent: (s) =>
      withSb(async (c) => {
        const row = clean(s, ['access_code', 'access_code_expires']);
        const q = s.id ? c.from('students').update(row).eq('id', s.id) : c.from('students').insert(row);
        return check(await q.select().single()) as Student;
      }),

    setStudentPhoto: (studentId, file) =>
      withSb(async (c) => {
        const up = await uploadTo(c, studentId, file, true);
        check(await c.from('students').update({ photo_bucket: 'files', photo_path: up.path }).eq('id', studentId));
      }),

    saveCourse: (course) =>
      withSb(async (c) => {
        const row = clean(course);
        const q = course.id ? c.from('courses').update(row).eq('id', course.id) : c.from('courses').insert(row);
        return num(check(await q.select().single()) as Course, courseNums);
      }),

    deleteCourse: (id) => withSb(async (c) => void check(await c.from('courses').delete().eq('id', id))),

    saveInstalment: (i) =>
      withSb(async (c) => {
        const row = clean(i);
        const q = i.id ? c.from('instalments').update(row).eq('id', i.id) : c.from('instalments').insert(row);
        return num(check(await q.select().single()) as Instalment, instNums);
      }),

    deleteInstalment: (id) => withSb(async (c) => void check(await c.from('instalments').delete().eq('id', id))),

    savePayment: (p, settle) =>
      withSb(async (c) => {
        const row = clean(p);
        if (p.id) check(await c.from('payments').update(row).eq('id', p.id));
        else check(await c.from('payments').insert(row));
        if (settle && p.instalment_id) check(await c.from('instalments').update({ status: 'paid' }).eq('id', p.instalment_id));
      }),

    deletePayment: (id) => withSb(async (c) => void check(await c.from('payments').delete().eq('id', id))),

    uploadDocument: (studentId, file, category, title, asRole) =>
      withSb(async (c) => {
        const up = await uploadTo(c, studentId, file);
        const { data: u } = await c.auth.getUser();
        const res = await c.from('documents').insert({
          student_id: studentId, bucket: 'files', path: up.path, category, title: title.trim() || up.name,
          mime: up.mime, size_bytes: up.size, uploaded_by: u.user?.id, uploaded_by_role: asRole,
        });
        if (res.error) {
          await c.storage.from('files').remove([up.path]);
          throw new Error(res.error.message);
        }
      }),

    deleteDocument: (doc) =>
      withSb(async (c) => {
        // File first: if that fails, nothing is half-deleted and the trustee can try again.
        const rm = await c.storage.from(doc.bucket).remove([doc.path]);
        if (rm.error) throw new Error(rm.error.message);
        check(await c.from('documents').delete().eq('id', doc.id));
      }),

    fileUrl: (bucket, path) =>
      withSb(async (c) => check(await c.storage.from(bucket).createSignedUrl(path, 60 * 30))!.signedUrl),

    addNote: (studentId, body, authorName) =>
      withSb(async (c) => void check(await c.from('notes').insert({ student_id: studentId, body, author_name: authorName }))),

    deleteNote: (id) => withSb(async (c) => void check(await c.from('notes').delete().eq('id', id))),

    issueAccessCode: (studentId) =>
      withSb(async (c) => check(await c.rpc('issue_access_code', { p_student: studentId })) as string),

    loadApplications: () =>
      withSb(async (c) => check(await c.from('applications').select('*').order('created_at', { ascending: false }).limit(500)) as Application[]),

    updateApplication: (id, patch) =>
      withSb(async (c) => void check(await c.from('applications').update(patch).eq('id', id))),

    enrolApplication: (id, trustId) =>
      withSb(async (c) => check(await c.rpc('enrol_application', { p_application: id, p_trust: trustId })) as string),

    deleteApplication: (app) =>
      withSb(async (c) => {
        if (app.student_id) throw new Error('This application is part of a student file. Delete documents from the student file instead.');
        const paths = (app.files ?? []).map((f) => f.path).filter(Boolean);
        if (paths.length) {
          const rm = await c.storage.from('applications').remove(paths);
          if (rm.error) throw new Error(rm.error.message);
        }
        check(await c.from('applications').delete().eq('id', app.id));
      }),

    countUnusedUploads: () =>
      withSb(async (c) => (check(await c.rpc('stale_application_uploads')) as string[]).length),

    removeUnusedUploads: () =>
      withSb(async (c) => {
        const names = check(await c.rpc('stale_application_uploads')) as string[];
        for (let i = 0; i < names.length; i += 100) {
          const rm = await c.storage.from('applications').remove(names.slice(i, i + 100));
          if (rm.error) throw new Error(rm.error.message);
        }
        return names.length;
      }),
  };
}
