// Preview mode: the whole portal running on fictional sample data in this browser only.
// Used until Supabase is connected, so the trustees can try it out. Nothing here is real.
import type { PortalApi, Session } from './api';
import type {
  Application, Course, DocumentRec, Instalment, Note, Overview, Payment, Profile, Student, Trust,
} from './types';

type Db = Overview & { documents: DocumentRec[]; notes: Note[]; profiles: Profile[] };

const KEY = 'jvj-demo-data-v1';
const SESSION_KEY = 'jvj-demo-session';
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const day = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

function seed(): Db {
  const rukan: Trust = { id: id(), name: 'Rukan Trust' };
  const noorbhai: Trust = { id: id(), name: 'Y A J Noorbhai Trust' };
  const base = (full_name: string, code: string, extra: Partial<Student> = {}): Student => ({
    id: id(), code, status: 'active', full_name, preferred_name: null, date_of_birth: null, nic: null, phone: null,
    whatsapp: null, email: null, address: null, city: 'Colombo', school: null, guardian_details: null,
    family_situation: null, ambition: null, photo_bucket: null, photo_path: null, application_id: null,
    access_code: null, access_code_expires: null, created_at: now(), updated_at: now(), ...extra,
  });
  const s1 = base('Amaya Perera', 'S-001', {
    date_of_birth: '2004-03-14', phone: '077 000 0001', email: 'amaya@example.com', school: 'Sample Girls’ College',
    guardian_details: 'Mother: seamstress. Father: driver.', ambition: 'Chartered accountant within 8 years.',
  });
  const s2 = base('Fatima Hussain', 'S-002', {
    date_of_birth: '2003-11-02', phone: '077 000 0002', city: 'Kandy', school: 'Sample International School',
  });
  const s3 = base('Fatima Hussain', 'S-003', {
    date_of_birth: '2005-06-21', phone: '076 000 0003', city: 'Galle', school: 'Sample Central College',
  });
  const s4 = base('Kasun Silva', 'S-004', { status: 'completed', phone: '071 000 0004' });

  const course = (student: Student, trust: Trust, extra: Partial<Course>): Course => ({
    id: id(), student_id: student.id, trust_id: trust.id, title: '', institution: null, awarding_body: null,
    start_date: null, duration_years: null, payment_plan: null, total_fee_lkr: 0, total_fee_foreign: 0,
    foreign_currency: null, status: 'ongoing', notes: null, created_at: now(), ...extra,
  });
  const c1 = course(s1, rukan, {
    title: 'BSc (Hons) Business & Management', institution: 'Sample Campus, Colombo', awarding_body: 'Sample University (UK)',
    start_date: day(-400), duration_years: 3, payment_plan: 'Per semester', total_fee_lkr: 250000,
    total_fee_foreign: 975, foreign_currency: 'GBP',
  });
  const c2 = course(s2, noorbhai, {
    title: 'Diploma in Teaching & Learning (Level 5)', institution: 'Sample Institute', start_date: day(-200),
    duration_years: 1, payment_plan: 'Annually', total_fee_lkr: 265000, total_fee_foreign: 345, foreign_currency: 'GBP',
  });
  const c3 = course(s3, rukan, {
    title: 'BEng (Hons) Electrical & Electronic Engineering', institution: 'Sample Academy', start_date: day(-30),
    duration_years: 3, payment_plan: 'Per semester', total_fee_lkr: 1320000, total_fee_foreign: 950, foreign_currency: 'GBP',
  });
  const c4 = course(s4, noorbhai, {
    title: 'Higher Diploma in Interior Design', institution: 'Sample Design School', duration_years: 2,
    total_fee_lkr: 730000, status: 'completed',
  });

  const inst = (c: Course, label: string, due: string, lkr: number, gbp = 0, status: Instalment['status'] = 'due', funded_by: Instalment['funded_by'] = 'trust'): Instalment => ({
    id: id(), course_id: c.id, student_id: c.student_id, label, due_date: due, amount_lkr: lkr, amount_foreign: gbp,
    foreign_currency: gbp ? 'GBP' : null, funded_by, status, notes: null, created_at: now(),
  });
  const i11 = inst(c1, 'Registration fee', day(-380), 50000, 0, 'paid');
  const i12 = inst(c1, '1st instalment', day(-200), 50000, 325, 'paid');
  const i13 = inst(c1, '2nd instalment', day(-12), 50000, 325);
  const i14 = inst(c1, '3rd instalment', day(170), 50000, 325);
  const i15 = inst(c1, '4th instalment', day(350), 50000);
  const i21 = inst(c2, 'Annual fee', day(18), 265000, 345);
  const i31 = inst(c3, 'Year 1', day(-30), 440000, 0, 'paid', 'self');
  const i32 = inst(c3, 'Year 2 — Semester 1', day(40), 220000);
  const i33 = inst(c3, 'Year 2 — Semester 2', day(220), 220000);
  const i34 = inst(c3, 'Year 3 (incl. royalty fee)', day(400), 440000, 950);
  const i41 = inst(c4, 'Course fee', day(-900), 420000, 0, 'paid');
  const i42 = inst(c4, 'Final year', day(-500), 310000, 0, 'paid');

  const pay = (i: Instalment, trust: Trust, paid_on: string, rate: number | null, extra: Partial<Payment> = {}): Payment => ({
    id: id(), student_id: i.student_id, course_id: i.course_id, instalment_id: i.id, trust_id: trust.id, paid_on,
    amount_lkr: i.amount_lkr, amount_foreign: i.amount_foreign, foreign_currency: i.foreign_currency, fx_rate: rate,
    total_lkr: i.amount_lkr + i.amount_foreign * (rate ?? 0), method: 'Bank transfer', paid_to: 'Institution',
    reference: null, notes: null, created_at: now(), ...extra,
  });

  const applications: Application[] = [
    {
      id: id(), reference: 'JVJ-2026-K7Q2M', status: 'new', full_name: 'Sample Applicant', email: 'applicant@example.com',
      phone: '077 000 0099', review_notes: null, student_id: null, created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
      files: [],
      answers: {
        fullName: 'Sample Applicant', dateOfBirth: '2006-01-09', phone: '077 000 0099', email: 'applicant@example.com', city: 'Negombo',
        school: 'Sample Maha Vidyalaya',
        education: [{ id: 'e1', level: 'G.C.E. A/L', year: '2025', results: 'Maths A, Physics B, Chemistry B' }],
        achievements: 'Prefect; school chess team.', hasWork: false,
        ambition: 'To become a civil engineer and design safer bridges for rural areas.',
        goals: 'Graduate, gain chartered status, and mentor students from my village.',
        courseTitle: 'BSc (Hons) Civil Engineering', institution: 'Sample Campus', durationYears: '4', paymentFrequency: 'semester',
        totalFeeLkr: '1800000', totalFeeForeign: '', foreignCurrency: '', selfFinancedLkr: '300000', assistanceKind: 'grant',
        plan: [{ id: 'p1', label: 'Year 1', when: '2026-09', amountLkr: '450000', amountForeign: '', payer: 'trust' }],
        familySituation: 'My father is a fisherman; income varies with the season. My mother looks after my two younger brothers.',
        signatureName: 'Sample Applicant',
      },
    },
  ];

  return {
    trusts: [rukan, noorbhai],
    students: [s1, s2, s3, s4],
    courses: [c1, c2, c3, c4],
    instalments: [i11, i12, i13, i14, i15, i21, i31, i32, i33, i34, i41, i42],
    payments: [
      pay(i11, rukan, day(-380), null),
      pay(i12, rukan, day(-195), 450, { reference: 'TT-0042' }),
      pay(i31, rukan, day(-30), null, { paid_to: 'Paid by family', notes: 'Self-financed — recorded for completeness' }),
      pay(i41, noorbhai, day(-900), null),
      pay(i42, noorbhai, day(-500), null),
    ].map((p) => (p.instalment_id === i31.id ? { ...p, trust_id: null } : p)),
    applications,
    documents: [],
    notes: [
      { id: id(), student_id: s1.id, body: 'Spoke to Amaya’s mother — 2nd instalment invoice expected from the campus this week.', author_name: 'Trustee', created_at: now() },
    ],
    profiles: [],
  };
}

export function createDemoApi(): PortalApi {
  const files = new Map<string, string>(); // path -> object URL (this browser tab only)
  let db: Db;
  try {
    db = JSON.parse(localStorage.getItem(KEY) || 'null') ?? seed();
  } catch {
    db = seed();
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      /* storage full or blocked — keep working in memory */
    }
  };
  const listeners = new Set<(e: string) => void>();
  const emit = (e: string) => listeners.forEach((l) => l(e));
  const session = (): { role: 'admin' | 'student'; studentId?: string } | null => {
    try {
      return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  };
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
  const upsert = <T extends { id: string }>(list: T[], row: Partial<T> & { id?: string }, defaults: () => T): T => {
    const existing = row.id ? list.find((x) => x.id === row.id) : undefined;
    if (existing) {
      Object.assign(existing, row);
      return existing;
    }
    const created = { ...defaults(), ...row, id: row.id || id() } as T;
    list.push(created);
    return created;
  };
  const placeholder = (title: string) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#F8F6F0"/><text x="50%" y="46%" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#3A362D">${title.replace(/[<&>]/g, '')}</text><text x="50%" y="56%" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#6F6F6F">Preview mode — sample document</text></svg>`,
    );
  const addFile = (studentId: string, file: File) => {
    const path = `students/${studentId}/${id()}-${file.name}`;
    files.set(path, URL.createObjectURL(file));
    return path;
  };
  const visibleStudentId = () => {
    const s = session();
    return s?.role === 'student' ? s.studentId : undefined;
  };

  const api: PortalApi = {
    mode: 'demo',
    getSession: async () => {
      const s = session();
      return s ? ({ userId: s.role === 'admin' ? 'demo-admin' : `demo-student-${s.studentId}`, email: `${s.role}@preview` } as Session) : null;
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signIn(email) {
      const asStudent = email.startsWith('student');
      const s = asStudent ? { role: 'student' as const, studentId: db.students[0].id } : { role: 'admin' as const };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      emit('SIGNED_IN');
    },
    async signUp() {
      throw new Error('Creating accounts works once the portal is connected to Supabase.');
    },
    async signOut() {
      sessionStorage.removeItem(SESSION_KEY);
      emit('SIGNED_OUT');
    },
    async sendPasswordReset() {
      throw new Error('Password reset works once the portal is connected to Supabase.');
    },
    async updatePassword() {},
    async getProfile() {
      const s = session();
      if (!s) return null;
      return s.role === 'admin'
        ? { id: 'demo-admin', role: 'admin', student_id: null, email: 'trustee@preview', full_name: 'Trustee (preview)' }
        : { id: 'demo-student', role: 'student', student_id: s.studentId ?? null, email: 'student@preview', full_name: null };
    },
    loadOverview: () => wait(structuredClone({ ...db, documents: undefined, notes: undefined, profiles: undefined }) as Overview),
    async loadStudent(sid) {
      const own = visibleStudentId();
      if (own && own !== sid) throw new Error('You don’t have permission to do that.');
      const student = db.students.find((s) => s.id === sid);
      if (!student) throw new Error('Student not found');
      return wait(structuredClone({
        student,
        courses: db.courses.filter((c) => c.student_id === sid),
        instalments: db.instalments.filter((i) => i.student_id === sid).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
        payments: db.payments.filter((p) => p.student_id === sid).sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
        documents: db.documents.filter((d) => d.student_id === sid),
        notes: own ? [] : db.notes.filter((n) => n.student_id === sid),
        logins: own ? [] : db.profiles.filter((p) => p.student_id === sid),
        trusts: db.trusts,
      }));
    },
    async saveStudent(s) {
      const n = db.students.length + 1;
      const row = upsert(db.students, { ...s, updated_at: now() }, () => ({
        ...db.students[0], id: id(), code: `S-${String(n).padStart(3, '0')}`, status: 'active' as const, full_name: '', preferred_name: null,
        date_of_birth: null, nic: null, phone: null, whatsapp: null, email: null, address: null, city: null, school: null,
        guardian_details: null, family_situation: null, ambition: null, photo_bucket: null, photo_path: null,
        application_id: null, access_code: null, access_code_expires: null, created_at: now(),
      }));
      save();
      return structuredClone(row);
    },
    async setStudentPhoto(studentId, file) {
      const s = db.students.find((x) => x.id === studentId)!;
      s.photo_bucket = 'files';
      s.photo_path = addFile(studentId, file);
      save();
    },
    async saveCourse(c) {
      const row = upsert(db.courses, c, () => ({
        id: id(), student_id: '', trust_id: null, title: '', institution: null, awarding_body: null, start_date: null,
        duration_years: null, payment_plan: null, total_fee_lkr: 0, total_fee_foreign: 0, foreign_currency: null,
        status: 'ongoing' as const, notes: null, created_at: now(),
      }));
      save();
      return structuredClone(row);
    },
    async deleteCourse(cid) {
      db.courses = db.courses.filter((c) => c.id !== cid);
      db.instalments = db.instalments.filter((i) => i.course_id !== cid);
      save();
    },
    async saveInstalment(i) {
      const course = db.courses.find((c) => c.id === i.course_id);
      const row = upsert(db.instalments, { ...i, student_id: course?.student_id ?? i.student_id }, () => ({
        id: id(), course_id: '', student_id: '', label: '', due_date: null, amount_lkr: 0, amount_foreign: 0,
        foreign_currency: null, funded_by: 'trust' as const, status: 'due' as const, notes: null, created_at: now(),
      }));
      save();
      return structuredClone(row);
    },
    async deleteInstalment(iid) {
      db.instalments = db.instalments.filter((i) => i.id !== iid);
      save();
    },
    async savePayment(p, settle) {
      const row = upsert(db.payments, p, () => ({
        id: id(), student_id: '', course_id: null, instalment_id: null, trust_id: null, paid_on: day(0), amount_lkr: 0,
        amount_foreign: 0, foreign_currency: null, fx_rate: null, total_lkr: 0, method: null, paid_to: null, reference: null,
        notes: null, created_at: now(),
      }));
      row.total_lkr = Number(row.amount_lkr) + Number(row.amount_foreign) * Number(row.fx_rate ?? 0);
      if (settle && p.instalment_id) {
        const i = db.instalments.find((x) => x.id === p.instalment_id);
        if (i) i.status = 'paid';
      }
      save();
    },
    async deletePayment(pid) {
      db.payments = db.payments.filter((p) => p.id !== pid);
      save();
    },
    async uploadDocument(studentId, file, category, title, asRole) {
      const own = visibleStudentId();
      if (own && own !== studentId) throw new Error('You don’t have permission to do that.');
      db.documents.unshift({
        id: id(), student_id: studentId, bucket: 'files', path: addFile(studentId, file), category, title: title || file.name,
        mime: file.type, size_bytes: file.size, uploaded_by_role: asRole, created_at: now(),
      });
      save();
    },
    async deleteDocument(doc) {
      db.documents = db.documents.filter((d) => d.id !== doc.id);
      save();
    },
    async fileUrl(_bucket, path) {
      return files.get(path) ?? placeholder(path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/, '') ?? 'Document');
    },
    async addNote(studentId, body, authorName) {
      db.notes.unshift({ id: id(), student_id: studentId, body, author_name: authorName, created_at: now() });
      save();
    },
    async deleteApplication(app) {
      db.applications = db.applications.filter((x) => x.id !== app.id);
      save();
    },
    async countUnusedUploads() {
      return 0;
    },
    async removeUnusedUploads() {
      return 0;
    },
    async deleteNote(nid) {
      db.notes = db.notes.filter((n) => n.id !== nid);
      save();
    },
    async issueAccessCode(studentId) {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => alphabet[b % 32]).join('');
      const s = db.students.find((x) => x.id === studentId)!;
      s.access_code = code;
      s.access_code_expires = new Date(Date.now() + 14 * 86400000).toISOString();
      save();
      return code;
    },
    loadApplications: () => wait(structuredClone(db.applications)),
    async updateApplication(aid, patch) {
      Object.assign(db.applications.find((a) => a.id === aid)!, patch);
      save();
    },
    async enrolApplication(aid, trustId) {
      const a = db.applications.find((x) => x.id === aid)!;
      if (a.student_id) return a.student_id;
      const ans = a.answers as Record<string, string>;
      const s = await api.saveStudent({
        full_name: a.full_name, email: a.email, phone: a.phone, whatsapp: a.phone, city: ans.city || null,
        school: ans.school || null, date_of_birth: ans.dateOfBirth || null, family_situation: ans.familySituation || null,
        ambition: [ans.ambition, ans.goals].filter(Boolean).join('\n\n') || null, application_id: a.id,
      });
      const c = await api.saveCourse({
        student_id: s.id, trust_id: trustId, title: ans.courseTitle || 'Course', institution: ans.institution || null,
        duration_years: Number(ans.durationYears) || null, payment_plan: ans.paymentFrequency || null,
        total_fee_lkr: Number(ans.totalFeeLkr) || 0, total_fee_foreign: Number(ans.totalFeeForeign) || 0,
        foreign_currency: (ans.foreignCurrency as Course['foreign_currency']) || null,
      });
      for (const r of ((a.answers.plan as Record<string, string>[]) ?? [])) {
        await api.saveInstalment({
          course_id: c.id, student_id: s.id, label: r.label || 'Instalment',
          due_date: /^\d{4}-\d{2}$/.test(r.when) ? `${r.when}-01` : null, amount_lkr: Number(r.amountLkr) || 0,
          amount_foreign: Number(r.amountForeign) || 0,
          foreign_currency: Number(r.amountForeign) ? ((ans.foreignCurrency as Course['foreign_currency']) || 'GBP') : null,
          funded_by: r.payer === 'self' ? 'self' : 'trust',
        });
      }
      a.student_id = s.id;
      a.status = 'accepted';
      save();
      return s.id;
    },
  };
  return api;
}

export function resetDemo() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
