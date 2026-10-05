import { useRef, useState } from 'react';
import { fmtAmount, fmtLkr, today } from '../format';
import {
  CURRENCIES, type Course, type Currency, type Instalment, type Payment, type Student, type Trust,
} from '../types';
import { Button, Field, Modal, MoneyInput, Select, usePortal, useSaver } from '../ui';

const currencyOpts = CURRENCIES.map((c) => ({ value: c, label: c }));

function useForm<T extends object>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const set = <K extends keyof T>(k: K, val: T[K]) => setV((s) => ({ ...s, [k]: val }));
  return [v, set] as const;
}

function Footer({ busy, onClose, label = 'Save', danger }: { busy: boolean; onClose: () => void; label?: string; danger?: { label: string; onClick: () => void } }) {
  return (
    <>
      {danger && <Button variant="danger" onClick={danger.onClick} disabled={busy} className="left">{danger.label}</Button>}
      <Button onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" type="submit" form="pform" disabled={busy}>{busy ? 'Saving…' : label}</Button>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------

export function StudentForm({ student, onClose, onSaved }: { student?: Student; onClose: () => void; onSaved: (s: Student) => void }) {
  const { api } = usePortal();
  const [v, set] = useForm({
    full_name: student?.full_name ?? '', preferred_name: student?.preferred_name ?? '', status: student?.status ?? 'active',
    date_of_birth: student?.date_of_birth ?? '', nic: student?.nic ?? '', phone: student?.phone ?? '',
    whatsapp: student?.whatsapp ?? '', email: student?.email ?? '', address: student?.address ?? '', city: student?.city ?? '',
    school: student?.school ?? '', guardian_details: student?.guardian_details ?? '',
    family_situation: student?.family_situation ?? '', ambition: student?.ambition ?? '',
  });
  const [nameErr, setNameErr] = useState('');
  const saved = useRef<Student>(null);
  const { busy, error, run } = useSaver(() => saved.current && onSaved(saved.current));

  return (
    <Modal title={student ? `Edit ${student.full_name}` : 'Add a student'} onClose={onClose} wide
      footer={<Footer busy={busy} onClose={onClose} />}>
      <form id="pform" className="pform" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!v.full_name.trim()) return setNameErr('A name is needed.');
        run(async () => { saved.current = await api.saveStudent({ ...v, id: student?.id } as Partial<Student>); });
      }}>
        <Field label="Full name (as on ID)" error={nameErr}>{(id) => <input id={id} value={v.full_name} onChange={(e) => { set('full_name', e.target.value); setNameErr(''); }} autoFocus />}</Field>
        <Field label="Known as" hint="Optional — the name they go by">{(id) => <input id={id} value={v.preferred_name} onChange={(e) => set('preferred_name', e.target.value)} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={v.status} onChange={(x) => set('status', x as Student['status'])} options={[
          { value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'completed', label: 'Completed' }, { value: 'withdrawn', label: 'Withdrawn' },
        ]} />}</Field>
        <Field label="Date of birth">{(id) => <input id={id} type="date" value={v.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} />}</Field>
        <Field label="NIC / ID number">{(id) => <input id={id} value={v.nic} onChange={(e) => set('nic', e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <input id={id} type="tel" value={v.phone} onChange={(e) => set('phone', e.target.value)} />}</Field>
        <Field label="WhatsApp" hint="If different from phone">{(id) => <input id={id} type="tel" value={v.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" value={v.email} onChange={(e) => set('email', e.target.value)} />}</Field>
        <Field label="City / district">{(id) => <input id={id} value={v.city} onChange={(e) => set('city', e.target.value)} />}</Field>
        <Field label="Home address" wide>{(id) => <input id={id} value={v.address} onChange={(e) => set('address', e.target.value)} />}</Field>
        <Field label="School (alma mater)" wide>{(id) => <input id={id} value={v.school} onChange={(e) => set('school', e.target.value)} />}</Field>
        <Field label="Parents / guardians" wide hint="Names, occupations, how to reach them">{(id) => <textarea id={id} rows={2} value={v.guardian_details} onChange={(e) => set('guardian_details', e.target.value)} />}</Field>
        <Field label="Family financial situation" wide>{(id) => <textarea id={id} rows={3} value={v.family_situation} onChange={(e) => set('family_situation', e.target.value)} />}</Field>
        <Field label="Ambition and goals" wide>{(id) => <textarea id={id} rows={3} value={v.ambition} onChange={(e) => set('ambition', e.target.value)} />}</Field>
        {error && <p className="perror wide" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------

export function CourseForm({ studentId, trusts, course, onClose, onSaved }: { studentId: string; trusts: Trust[]; course?: Course; onClose: () => void; onSaved: () => void }) {
  const { api } = usePortal();
  const [v, set] = useForm({
    trust_id: course?.trust_id ?? trusts[0]?.id ?? '', title: course?.title ?? '', institution: course?.institution ?? '',
    awarding_body: course?.awarding_body ?? '', start_date: course?.start_date ?? '', duration_years: course?.duration_years ?? null,
    payment_plan: course?.payment_plan ?? '', total_fee_lkr: course?.total_fee_lkr ?? 0, total_fee_foreign: course?.total_fee_foreign ?? 0,
    foreign_currency: course?.foreign_currency ?? 'GBP', status: course?.status ?? 'ongoing', notes: course?.notes ?? '',
  });
  const [titleErr, setTitleErr] = useState('');
  const { busy, error, run } = useSaver(onSaved);

  return (
    <Modal title={course ? 'Edit course' : 'Add a course'} onClose={onClose} wide
      footer={<Footer busy={busy} onClose={onClose} danger={course ? { label: 'Delete course', onClick: () => {
        if (confirm('Delete this course and its whole payment schedule? Payments already logged are kept.')) run(() => api.deleteCourse(course.id));
      } } : undefined} />}>
      <form id="pform" className="pform" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim()) return setTitleErr('Give the course a name.');
        run(() => api.saveCourse({
          ...v, id: course?.id, student_id: studentId, trust_id: v.trust_id || null,
          foreign_currency: v.total_fee_foreign ? v.foreign_currency : null,
        } as Partial<Course>));
      }}>
        <Field label="Funded by">{(id) => <Select id={id} value={v.trust_id} onChange={(x) => set('trust_id', x)} options={trusts.map((t) => ({ value: t.id, label: t.name }))} />}</Field>
        <Field label="Status">{(id) => <Select id={id} value={v.status} onChange={(x) => set('status', x as Course['status'])} options={[
          { value: 'ongoing', label: 'Ongoing' }, { value: 'completed', label: 'Completed' }, { value: 'paused', label: 'Paused' }, { value: 'withdrawn', label: 'Withdrawn' },
        ]} />}</Field>
        <Field label="Course" wide error={titleErr}>{(id) => <input id={id} value={v.title} placeholder="e.g. BEng (Hons) Electrical & Electronic Engineering" onChange={(e) => { set('title', e.target.value); setTitleErr(''); }} />}</Field>
        <Field label="Where they study">{(id) => <input id={id} value={v.institution} placeholder="e.g. SLIIT Academy" onChange={(e) => set('institution', e.target.value)} />}</Field>
        <Field label="Awarding university" hint="Optional">{(id) => <input id={id} value={v.awarding_body} placeholder="e.g. Liverpool John Moores University" onChange={(e) => set('awarding_body', e.target.value)} />}</Field>
        <Field label="Start date">{(id) => <input id={id} type="date" value={v.start_date} onChange={(e) => set('start_date', e.target.value)} />}</Field>
        <Field label="Length (years)">{(id) => <input id={id} inputMode="decimal" value={v.duration_years ?? ''} onChange={(e) => set('duration_years', Number(e.target.value) || null)} />}</Field>
        <Field label="Payment plan" hint="How the institution bills">{(id) => (
          <>
            <input id={id} list="plans" value={v.payment_plan} onChange={(e) => set('payment_plan', e.target.value)} />
            <datalist id="plans"><option value="Per semester" /><option value="Per term" /><option value="Annually" /><option value="Full payment upfront" /><option value="Monthly" /></datalist>
          </>
        )}</Field>
        <Field label="Total fee in rupees">{(id) => <MoneyInput id={id} value={v.total_fee_lkr} onChange={(x) => set('total_fee_lkr', x)} />}</Field>
        <Field label="Plus a foreign-currency part" hint="e.g. a UK university's royalty fee">{(id) => (
          <div className="pinline">
            <MoneyInput id={id} value={v.total_fee_foreign} onChange={(x) => set('total_fee_foreign', x)} />
            <select aria-label="Currency" value={v.foreign_currency} onChange={(e) => set('foreign_currency', e.target.value as Currency)}>
              {currencyOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}</Field>
        <Field label="Notes" wide>{(id) => <textarea id={id} rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        {error && <p className="perror wide" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------

export function InstalmentForm({ courses, instalment, defaultCourseId, onClose, onSaved }: { courses: Course[]; instalment?: Instalment; defaultCourseId?: string; onClose: () => void; onSaved: () => void }) {
  const { api } = usePortal();
  const firstCourse = courses.find((c) => c.id === (instalment?.course_id ?? defaultCourseId)) ?? courses[0];
  const [v, set] = useForm({
    course_id: firstCourse?.id ?? '', label: instalment?.label ?? '', due_date: instalment?.due_date ?? '',
    amount_lkr: instalment?.amount_lkr ?? 0, amount_foreign: instalment?.amount_foreign ?? 0,
    foreign_currency: instalment?.foreign_currency ?? firstCourse?.foreign_currency ?? 'GBP',
    funded_by: instalment?.funded_by ?? 'trust', status: instalment?.status ?? 'due', notes: instalment?.notes ?? '',
  });
  const [labelErr, setLabelErr] = useState('');
  const { busy, error, run } = useSaver(onSaved);

  return (
    <Modal title={instalment ? 'Edit instalment' : 'Add an instalment'} onClose={onClose}
      footer={<Footer busy={busy} onClose={onClose} danger={instalment ? { label: 'Delete', onClick: () => {
        if (confirm('Delete this instalment?')) run(() => api.deleteInstalment(instalment.id));
      } } : undefined} />}>
      <form id="pform" className="pform" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!v.label.trim()) return setLabelErr('Name it, e.g. "Year 2 — Semester 1".');
        const c = courses.find((x) => x.id === v.course_id);
        run(() => api.saveInstalment({
          ...v, id: instalment?.id, student_id: c?.student_id, due_date: v.due_date || null,
          foreign_currency: v.amount_foreign ? v.foreign_currency : null,
        } as Partial<Instalment>));
      }}>
        {courses.length > 1 && (
          <Field label="Course" wide>{(id) => <Select id={id} value={v.course_id} onChange={(x) => set('course_id', x)} options={courses.map((c) => ({ value: c.id, label: c.title }))} />}</Field>
        )}
        <Field label="What it’s for" wide error={labelErr}>{(id) => (
          <>
            <input id={id} list="inst-labels" value={v.label} onChange={(e) => { set('label', e.target.value); setLabelErr(''); }} placeholder="e.g. Year 2 — Semester 1" />
            <datalist id="inst-labels">
              {['Registration fee', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 1 — Semester 1', 'Year 1 — Semester 2', '1st instalment', '2nd instalment', '3rd instalment', 'Exam fee', 'Royalty fee'].map((x) => <option key={x} value={x} />)}
            </datalist>
          </>
        )}</Field>
        <Field label="Due date">{(id) => <input id={id} type="date" value={v.due_date} onChange={(e) => set('due_date', e.target.value)} />}</Field>
        <Field label="Who pays">{(id) => <Select id={id} value={v.funded_by} onChange={(x) => set('funded_by', x as Instalment['funded_by'])} options={[
          { value: 'trust', label: 'The trust' }, { value: 'self', label: 'The family (self-financed)' },
        ]} />}</Field>
        <Field label="Rupees">{(id) => <MoneyInput id={id} value={v.amount_lkr} onChange={(x) => set('amount_lkr', x)} />}</Field>
        <Field label="Foreign currency">{(id) => (
          <div className="pinline">
            <MoneyInput id={id} value={v.amount_foreign} onChange={(x) => set('amount_foreign', x)} />
            <select aria-label="Currency" value={v.foreign_currency} onChange={(e) => set('foreign_currency', e.target.value as Currency)}>
              {currencyOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}</Field>
        <Field label="Status">{(id) => <Select id={id} value={v.status} onChange={(x) => set('status', x as Instalment['status'])} options={[
          { value: 'due', label: 'Still to pay' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled / not needed' },
        ]} />}</Field>
        <Field label="Notes" wide>{(id) => <input id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        {error && <p className="perror wide" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------------

export function PaymentForm({ studentId, courses, instalments, trusts, payment, instalmentId, onClose, onSaved }: {
  studentId: string; courses: Course[]; instalments: Instalment[]; trusts: Trust[]; payment?: Payment; instalmentId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { api } = usePortal();
  const linked = instalments.find((i) => i.id === (payment?.instalment_id ?? instalmentId));
  const courseOf = (iid: string) => courses.find((c) => c.id === instalments.find((i) => i.id === iid)?.course_id);
  const [v, set] = useForm({
    paid_on: payment?.paid_on ?? today(), instalment_id: linked?.id ?? '',
    amount_lkr: payment?.amount_lkr ?? linked?.amount_lkr ?? 0, amount_foreign: payment?.amount_foreign ?? linked?.amount_foreign ?? 0,
    foreign_currency: (payment?.foreign_currency ?? linked?.foreign_currency ?? courses[0]?.foreign_currency ?? 'GBP') as Currency,
    fx_rate: payment?.fx_rate ?? null as number | null,
    trust_id: payment?.trust_id ?? (linked ? courseOf(linked.id)?.trust_id : courses[0]?.trust_id) ?? '',
    method: payment?.method ?? 'Bank transfer', paid_to: payment?.paid_to ?? (linked ? courseOf(linked.id)?.institution : courses[0]?.institution) ?? '',
    reference: payment?.reference ?? '', notes: payment?.notes ?? '',
  });
  const [settle, setSettle] = useState(!payment);
  const [err, setErr] = useState('');
  const { busy, error, run } = useSaver(onSaved);
  const open = instalments.filter((i) => i.status === 'due' || i.id === linked?.id);
  const total = v.amount_lkr + v.amount_foreign * (v.fx_rate ?? 0);

  const pickInstalment = (iid: string) => {
    set('instalment_id', iid);
    const i = instalments.find((x) => x.id === iid);
    if (i && !payment) {
      set('amount_lkr', i.amount_lkr);
      set('amount_foreign', i.amount_foreign);
      if (i.foreign_currency) set('foreign_currency', i.foreign_currency);
      const c = courseOf(iid);
      if (c?.trust_id) set('trust_id', c.trust_id);
      if (c?.institution) set('paid_to', c.institution);
    }
  };

  return (
    <Modal title={payment ? 'Edit payment' : 'Log a payment'} onClose={onClose} wide
      footer={<Footer busy={busy} onClose={onClose} label={payment ? 'Save' : 'Log payment'} danger={payment ? { label: 'Delete', onClick: () => {
        if (confirm('Delete this payment record?')) run(() => api.deletePayment(payment.id));
      } } : undefined} />}>
      <form id="pform" className="pform" noValidate onSubmit={(e) => {
        e.preventDefault();
        if (!v.paid_on) return setErr('When was it paid?');
        if (!v.amount_lkr && !v.amount_foreign) return setErr('Enter how much was paid.');
        run(() => api.savePayment({
          ...v, id: payment?.id, student_id: studentId, instalment_id: v.instalment_id || null,
          course_id: v.instalment_id ? courseOf(v.instalment_id)?.id ?? null : courses[0]?.id ?? null,
          trust_id: v.trust_id || null, foreign_currency: v.amount_foreign ? v.foreign_currency : null,
          fx_rate: v.amount_foreign ? v.fx_rate : null,
        } as Partial<Payment>, settle && !!v.instalment_id));
      }}>
        <Field label="Which instalment" wide hint="Choosing one fills in the amounts">{(id) => (
          <Select id={id} value={v.instalment_id} onChange={pickInstalment} placeholder="Not linked to an instalment"
            options={open.map((i) => ({ value: i.id, label: `${i.label} — ${fmtAmount(i.amount_lkr, i.amount_foreign, i.foreign_currency)}` }))} />
        )}</Field>
        <Field label="Date paid">{(id) => <input id={id} type="date" value={v.paid_on} onChange={(e) => set('paid_on', e.target.value)} />}</Field>
        <Field label="Paid by">{(id) => <Select id={id} value={v.trust_id} onChange={(x) => set('trust_id', x)} placeholder="The family / not a trust"
          options={trusts.map((t) => ({ value: t.id, label: t.name }))} />}</Field>
        <Field label="Rupees paid">{(id) => <MoneyInput id={id} value={v.amount_lkr} onChange={(x) => set('amount_lkr', x)} />}</Field>
        <Field label="Foreign currency paid">{(id) => (
          <div className="pinline">
            <MoneyInput id={id} value={v.amount_foreign} onChange={(x) => set('amount_foreign', x)} />
            <select aria-label="Currency" value={v.foreign_currency} onChange={(e) => set('foreign_currency', e.target.value as Currency)}>
              {currencyOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}</Field>
        {v.amount_foreign > 0 && (
          <Field label={`Exchange rate (rupees per 1 ${v.foreign_currency})`} hint="The rate on the day — locks in the real cost to the trust">
            {(id) => <MoneyInput id={id} value={v.fx_rate} onChange={(x) => set('fx_rate', x || null)} placeholder="e.g. 450" />}
          </Field>
        )}
        <div className="pfield ptotal">
          <span className="label">Cost to the trust</span>
          <strong>{v.amount_foreign && !v.fx_rate ? `${fmtLkr(v.amount_lkr)} + rate needed` : fmtLkr(total)}</strong>
        </div>
        <Field label="Method">{(id) => (
          <>
            <input id={id} list="methods" value={v.method} onChange={(e) => set('method', e.target.value)} />
            <datalist id="methods"><option value="Bank transfer" /><option value="Telegraphic transfer" /><option value="Cheque" /><option value="Cash" /><option value="Card" /></datalist>
          </>
        )}</Field>
        <Field label="Paid to">{(id) => <input id={id} value={v.paid_to} onChange={(e) => set('paid_to', e.target.value)} placeholder="e.g. SLIIT Academy" />}</Field>
        <Field label="Reference / receipt no.">{(id) => <input id={id} value={v.reference} onChange={(e) => set('reference', e.target.value)} />}</Field>
        <Field label="Notes" wide>{(id) => <input id={id} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        {v.instalment_id && !payment && (
          <label className="pcheck wide">
            <input type="checkbox" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
            Mark “{instalments.find((i) => i.id === v.instalment_id)?.label}” as paid
          </label>
        )}
        {(err || error) && <p className="perror wide" role="alert">{err || error}</p>}
      </form>
    </Modal>
  );
}
