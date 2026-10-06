import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  clearDraft, emptyAnswers, emptyFiles, hasAnswers, loadDraft, newId, requested, saveDraft, submitApplication, toNumber,
  type Answers, type EducationRecord, type Files, type PlanRow, type SubmitResult,
} from '../lib/application';
import { acceptsFile, fileTooLarge } from '../lib/files';
import { Chips, FileField, PhotoField, Switch, TextField } from './fields';

type FieldError = { field: string; msg: string } | null;

// Ten short screens in five stages — the paper form, one breath at a time.
const STAGES = ['Your profile', 'Education', 'Future plans', 'Finances', 'Review & sign'];
const SCENES = [
  { stage: 0, name: 'Your name' },
  { stage: 0, name: 'Contact' },
  { stage: 0, name: 'Photo & birthday' },
  { stage: 1, name: 'Your education' },
  { stage: 1, name: 'Achievements & work' },
  { stage: 2, name: 'Your plans' },
  { stage: 3, name: 'The programme' },
  { stage: 3, name: 'Costs' },
  { stage: 3, name: 'Your family' },
  { stage: 4, name: 'Review' },
];
const TOTAL = SCENES.length;
const LEAF_YS = [700, 560, 420, 280, 140];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD'];
const LEVELS = ['G.C.E. O/L', 'G.C.E. A/L', 'IGCSE', 'IAS / IAL', 'Diploma', 'Degree', 'Other'];

const fmt = (n: number) => n.toLocaleString('en-LK');

function validate(scene: number, a: Answers, files: Files): FieldError {
  switch (scene) {
    case 1:
      return a.fullName.trim() ? null : { field: 'fullName', msg: 'Please tell us your name.' };
    case 2:
      if (a.email.trim() && !EMAIL_RE.test(a.email.trim())) return { field: 'email', msg: 'That email address doesn’t look quite right.' };
      if (!a.email.trim() && !a.phone.trim()) return { field: 'phone', msg: 'We need one way to reach you — a phone number or an email.' };
      return null;
    case 3:
      if (!files.photo) return { field: 'photo', msg: 'Please add a photo of yourself.' };
      return a.dateOfBirth ? null : { field: 'dateOfBirth', msg: 'Please add your date of birth.' };
    case 4:
      return a.school.trim() ? null : { field: 'school', msg: 'Which school did you go to?' };
    case 5:
      return a.hasWork && !a.workRole.trim() && !a.workCompany.trim() ? { field: 'workRole', msg: 'Tell us the role or the place — or switch this off.' } : null;
    case 6:
      return a.ambition.trim() ? null : { field: 'ambition', msg: 'A few lines is enough. This is one of the parts we read most carefully.' };
    case 7:
      if (!a.courseTitle.trim()) return { field: 'courseTitle', msg: 'Which course or degree is it?' };
      if (!a.institution.trim()) return { field: 'institution', msg: 'Where will you study?' };
      return a.durationYears ? null : { field: 'durationYears-0', msg: 'How many years is the course?' };
    case 8: {
      if (!toNumber(a.totalFeeLkr) && !toNumber(a.totalFeeForeign)) return { field: 'totalFeeLkr', msg: 'Roughly how much does the whole course cost?' };
      if (toNumber(a.selfFinancedLkr) > toNumber(a.totalFeeLkr) || toNumber(a.selfFinancedForeign) > toNumber(a.totalFeeForeign))
        return { field: 'selfFinancedLkr', msg: 'What your family covers can’t be more than the total.' };
      if (!a.assistanceKind) return { field: 'assistanceKind-0', msg: 'Choose grant, loan, or either.' };
      if (!a.plan.some((p) => p.label.trim() && (toNumber(p.amountLkr) || toNumber(p.amountForeign))))
        return { field: `plan-label-${a.plan[0]?.id}`, msg: 'Add at least one payment — what it’s for and how much.' };
      return null;
    }
    case 9:
      return a.familySituation.trim() ? null : { field: 'familySituation', msg: 'Please tell us a little about your family’s situation.' };
    case 10:
      if (!a.declTruthful || !a.declWilling || !a.declInterview) return { field: 'declTruthful', msg: 'Please tick all three to send.' };
      return a.signatureName.trim().length >= 2 ? null : { field: 'signatureName', msg: 'Type your full name to sign.' };
    default:
      return null;
  }
}

export function Journey({ onClose }: { onClose: () => void }) {
  const [draft] = useState(() => loadDraft(TOTAL));
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? emptyAnswers);
  const [scene, setScene] = useState(draft?.scene ?? 1);
  const [resumed, setResumed] = useState(!!draft && hasAnswers(draft.answers));
  const [files, setFiles] = useState<Files>(emptyFiles);
  const [error, setError] = useState<FieldError>(null);
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const reviewReturn = useRef(false);

  const done = result !== null;
  const stage = done ? STAGES.length : SCENES[scene - 1].stage;

  useEffect(() => {
    if (!done && hasAnswers(answers)) saveDraft({ answers, scene });
  }, [answers, scene, done]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Move focus into each new screen: the first field on desktop, the question on touch.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    el.closest('.journey')?.scrollTo({ top: 0 });
    const fine = window.matchMedia('(pointer: fine)').matches;
    const target = fine
      ? el.querySelector<HTMLElement>('input:not([type=file]):not([type=checkbox]), textarea, [role=radio], h2')
      : el.querySelector<HTMLElement>('h2');
    target?.focus({ preventScroll: true });
  }, [scene, done]);

  const set = useCallback(<K extends keyof Answers>(k: K, v: Answers[K]) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    setError((e) => (e && e.field.startsWith(String(k)) ? null : e));
  }, []);

  const focusField = (id: string) => document.getElementById(id)?.focus();

  const go = (n: number) => {
    setError(null);
    setResumed(false);
    setScene(Math.min(Math.max(1, n), TOTAL));
  };

  const next = () => {
    const err = validate(scene, answers, files);
    if (err) {
      setError(err);
      focusField(err.field);
      return;
    }
    if (reviewReturn.current) {
      reviewReturn.current = false;
      return go(TOTAL);
    }
    go(scene + 1);
  };

  const editFromReview = (n: number) => {
    reviewReturn.current = true;
    go(n);
  };

  const send = async () => {
    // Re-check everything (a resumed draft has no files attached yet).
    for (let n = 1; n <= TOTAL; n++) {
      const err = validate(n, answers, files);
      if (err) {
        if (n !== scene) reviewReturn.current = true;
        setScene(n);
        setError(err);
        setTimeout(() => focusField(err.field), 50);
        return;
      }
    }
    setSending({ done: 0, total: 1 });
    setSendError('');
    try {
      const r = await submitApplication(answers, files, honeypot, (d, t) => setSending({ done: d, total: t }));
      clearDraft();
      setResult(r);
    } catch (e) {
      const busy = /JVJ_BUSY|row-level security|violates/i.test(String((e as Error)?.message ?? e));
      setSendError(busy
        ? 'We’re receiving a lot of applications right now. Please try again in a few hours — your answers are saved on this device.'
        : 'We couldn’t send your application just now. Please check your connection and try again — your answers are still here.');
    } finally {
      setSending(null);
    }
  };

  const startOver = () => {
    clearDraft();
    setAnswers(emptyAnswers());
    setFiles(emptyFiles());
    setResumed(false);
    setError(null);
    setScene(1);
  };

  const setFile = (k: Exclude<keyof Files, 'edu'>) => (f: File | null) => {
    if (f && (!acceptsFile(f) || fileTooLarge(f))) {
      setError({ field: k, msg: !acceptsFile(f) ? 'Please choose a photo or a PDF.' : 'That file is too large. A photo from your phone camera will work.' });
      return;
    }
    setFiles((fs) => ({ ...fs, [k]: f }));
    setError((e) => (e?.field === k ? null : e));
  };
  const setEduFile = (id: string) => (f: File | null) => {
    if (f && (!acceptsFile(f) || fileTooLarge(f))) return setError({ field: `edu-file-${id}`, msg: 'Please choose a photo or a PDF under 10 MB.' });
    setFiles((fs) => ({ ...fs, edu: { ...fs.edu, [id]: f } }));
    setError(null);
  };

  const setEdu = (id: string, k: keyof EducationRecord, v: string) =>
    set('education', answers.education.map((e) => (e.id === id ? { ...e, [k]: v } : e)));
  const setPlan = (id: string, k: keyof PlanRow, v: string) => {
    set('plan', answers.plan.map((p) => (p.id === id ? { ...p, [k]: v } : p)));
    setError((e) => (e?.field.startsWith('plan') ? null : e));
  };

  const copyRef = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.reference);
      setCopied(true);
    } catch {
      /* clipboard blocked — the number is still selectable */
    }
  };

  // ---- environment: the stem grows and a leaf opens as each stage is completed ----
  const progress = done ? 1 : (scene - 1) / TOTAL;
  const stemOffset = 900 - Math.round(900 * Math.max(progress, 0.04));
  const errFor = (f: string) => (error?.field === f ? error.msg : undefined);
  const a = answers;
  const req = requested(a);
  const cur = a.foreignCurrency;

  let content: ReactNode;

  if (done) {
    content = (
      <div className="scene resolution" key="done">
        <div className="scene-kicker scene-rise">Received</div>
        <h2 className="serif scene-rise-d1" tabIndex={-1}>Thank you. It has come through.</h2>
        <p className="lede scene-rise-d2">
          The trustees will read what you’ve shared carefully and write to you — whether it’s a yes, a no, or a question.
          You may be invited to a short conversation with them.
        </p>
        {result.preview && (
          <p className="preview-note" role="note">Preview mode: the site isn’t connected yet, so this application was not sent anywhere.</p>
        )}
        <div className="scene-rise-d3">
          <div className="ref-card">
            <div className="label">Your reference number</div>
            <div className="ref">{result.reference}</div>
          </div>
          <button type="button" className="btn-text ref-copy" onClick={copyRef} aria-live="polite">{copied ? 'Copied' : 'Copy number'}</button>
          <div className="keep">Keep this number. It is how you write to us, and how we find your application quickly.</div>
        </div>
        <button type="button" onClick={onClose} className="btn btn-dark cta scene-rise-d4">Return home</button>
      </div>
    );
  } else {
    let prompt = '';
    let sub: ReactNode = '';
    let control: ReactNode = null;
    const final = scene === TOTAL;

    switch (scene) {
      case 1:
        prompt = 'First — what’s your name?';
        sub = 'Your full name, as it appears on your ID.';
        control = (
          <TextField id="fullName" label="Full name" hideLabel big value={a.fullName} onChange={(v) => set('fullName', v)}
            placeholder="e.g. Nimal Perera" autoComplete="name" error={errFor('fullName')} />
        );
        break;
      case 2:
        prompt = 'How can we reach you?';
        sub = 'One of these is enough. WhatsApp on the phone number is fine.';
        control = (
          <>
            <TextField id="phone" label="Mobile / WhatsApp" type="tel" big value={a.phone} onChange={(v) => set('phone', v)}
              placeholder="e.g. 077 123 4567" autoComplete="tel" inputMode="tel" error={errFor('phone')} />
            <TextField id="email" label="Email" type="email" value={a.email} onChange={(v) => set('email', v)}
              placeholder="you@example.com" autoComplete="email" inputMode="email" error={errFor('email')} />
            <TextField id="city" label="City or district" optional value={a.city} onChange={(v) => set('city', v)}
              placeholder="e.g. Colombo 4" autoComplete="address-level2" />
          </>
        );
        break;
      case 3:
        prompt = 'A photo, and your birthday.';
        sub = 'The trustees like to put a face to every application.';
        control = (
          <>
            <PhotoField id="photo" label="Your photo" file={files.photo} onChange={setFile('photo')} error={errFor('photo')} />
            <TextField id="dateOfBirth" label="Date of birth" type="date" value={a.dateOfBirth} onChange={(v) => set('dateOfBirth', v)}
              autoComplete="bday" error={errFor('dateOfBirth')} />
            <FileField id="idFile" label="National ID or birth certificate" optional file={files.idFile} onChange={setFile('idFile')} error={errFor('idFile')} />
          </>
        );
        break;
      case 4:
        prompt = 'Tell us about your education.';
        sub = 'Your school, then each exam or course you’ve done — O/L, A/L, IGCSE, diplomas. A photo of each certificate helps a lot.';
        control = (
          <>
            <TextField id="school" label="School (alma mater)" value={a.school} onChange={(v) => set('school', v)}
              placeholder="e.g. Royal College, Colombo" error={errFor('school')} />
            {a.education.map((e, i) => (
              <fieldset key={e.id} className="record">
                <legend>Qualification {i + 1}</legend>
                <div className="record-grid">
                  <div className="field">
                    <label className="field-label" htmlFor={`edu-level-${e.id}`}>Exam or course</label>
                    <input id={`edu-level-${e.id}`} className="text-input" list="edu-levels" value={e.level}
                      onChange={(ev) => setEdu(e.id, 'level', ev.target.value)} placeholder="e.g. G.C.E. A/L" />
                  </div>
                  <TextField id={`edu-year-${e.id}`} label="Year" value={e.year} onChange={(v) => setEdu(e.id, 'year', v)} placeholder="e.g. 2022" inputMode="numeric" />
                </div>
                <TextField id={`edu-results-${e.id}`} label="Results" textarea rows={2} value={e.results} onChange={(v) => setEdu(e.id, 'results', v)}
                  placeholder="e.g. Maths A, Physics B, Chemistry C — or ‘results pending’" />
                <TextField id={`edu-school-${e.id}`} label="Where" optional value={e.school} onChange={(v) => setEdu(e.id, 'school', v)}
                  placeholder="If different from your school" />
                <FileField id={`edu-file-${e.id}`} label="Certificate or results sheet" optional file={files.edu[e.id] ?? null}
                  onChange={setEduFile(e.id)} error={errFor(`edu-file-${e.id}`)} />
                {a.education.length > 1 && (
                  <button type="button" className="btn-text record-remove" onClick={() => set('education', a.education.filter((x) => x.id !== e.id))}>
                    Remove this one
                  </button>
                )}
              </fieldset>
            ))}
            <datalist id="edu-levels">{LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
            <button type="button" className="add-row" onClick={() => set('education', [...a.education, { id: newId(), level: '', school: '', year: '', results: '' }])}>
              + Add another qualification
            </button>
          </>
        );
        break;
      case 5:
        prompt = 'Anything else you’re proud of?';
        sub = 'Prefect, sports, clubs, competitions, volunteering — and any work you’ve done.';
        control = (
          <>
            <TextField id="achievements" label="Co-curricular achievements" optional textarea rows={4} value={a.achievements}
              onChange={(v) => set('achievements', v)} placeholder="e.g. School prefect; debate team; volunteer at the temple library" />
            <Switch id="hasWork" label="I have work experience" checked={a.hasWork} onChange={(v) => set('hasWork', v)} />
            {a.hasWork && (
              <div className="record">
                <div className="record-grid">
                  <TextField id="workRole" label="Role" value={a.workRole} onChange={(v) => set('workRole', v)} placeholder="e.g. Part-time assistant" error={errFor('workRole')} />
                  <TextField id="workCompany" label="Where" value={a.workCompany} onChange={(v) => set('workCompany', v)} placeholder="e.g. a family business" />
                </div>
                <TextField id="workSkills" label="Skills you gained" optional textarea rows={2} value={a.workSkills} onChange={(v) => set('workSkills', v)} />
              </div>
            )}
          </>
        );
        break;
      case 6:
        prompt = 'Where are you headed?';
        sub = 'Your ambition, and where you hope to be in five to ten years. Write in English, Sinhala or Tamil — whichever is easiest.';
        control = (
          <>
            <TextField id="ambition" label="Your ambition" textarea rows={5} value={a.ambition} onChange={(v) => set('ambition', v)}
              placeholder="Tell us about the work you want to do and the difference you want to make…" error={errFor('ambition')} />
            <TextField id="goals" label="Your 5–10 year goals" optional textarea rows={4} value={a.goals} onChange={(v) => set('goals', v)}
              placeholder="e.g. Graduate, work for a year, then a master’s in…" />
          </>
        );
        break;
      case 7:
        prompt = 'Which programme is this for?';
        sub = 'The course you need help with. If you have the institution’s course or fee details, add them.';
        control = (
          <>
            <TextField id="courseTitle" label="Course or degree" big value={a.courseTitle} onChange={(v) => set('courseTitle', v)}
              placeholder="e.g. BEng (Hons) Electronic & Electrical Engineering" error={errFor('courseTitle')} />
            <div className="record-grid">
              <TextField id="institution" label="Where you’ll study" value={a.institution} onChange={(v) => set('institution', v)}
                placeholder="e.g. SLIIT Academy" error={errFor('institution')} />
              <TextField id="awardingBody" label="Awarding university" optional value={a.awardingBody} onChange={(v) => set('awardingBody', v)}
                placeholder="e.g. Liverpool John Moores University" />
            </div>
            <Chips name="durationYears" label="How long is the course?" value={a.durationYears} onPick={(v) => set('durationYears', v)}
              error={errFor('durationYears-0')}
              options={[{ value: '1', label: '1 year' }, { value: '2', label: '2 years' }, { value: '3', label: '3 years' }, { value: '4', label: '4 years' }, { value: '5', label: '5+' }]} />
            <Chips name="paymentFrequency" label="How are fees paid?" value={a.paymentFrequency} onPick={(v) => set('paymentFrequency', v)}
              options={[{ value: 'Per semester', label: 'Each semester' }, { value: 'Per term', label: 'Each term' }, { value: 'Annually', label: 'Once a year' }, { value: 'Full payment upfront', label: 'All upfront' }]} />
            <TextField id="startMonth" label="When does it start (or when did it)?" optional type="month" value={a.startMonth} onChange={(v) => set('startMonth', v)} />
            <FileField id="feeSchedule" label="Course details or fee schedule from the institution" optional file={files.feeSchedule} onChange={setFile('feeSchedule')} error={errFor('feeSchedule')} />
          </>
        );
        break;
      case 8:
        prompt = 'What does it cost, and what do you need?';
        sub = 'Estimates are fine. Many UK-linked courses have a rupee part and a foreign-currency part — add both if so.';
        control = (
          <>
            <div className="money-grid">
              <div className="money-head" aria-hidden="true"><span /><span>Rupees</span><span>Foreign part</span></div>
              <div className="money-row">
                <span className="money-label" id="lbl-total">Whole course fee</span>
                <input id="totalFeeLkr" className="text-input" inputMode="numeric" aria-labelledby="lbl-total" aria-describedby="hint-lkr" placeholder="e.g. 1,320,000"
                  value={a.totalFeeLkr} onChange={(e) => set('totalFeeLkr', e.target.value)} aria-invalid={errFor('totalFeeLkr') ? true : undefined} />
                <span className="money-foreign">
                  <input className="text-input" inputMode="numeric" aria-label="Whole course fee, foreign part" placeholder="e.g. 950"
                    value={a.totalFeeForeign} onChange={(e) => set('totalFeeForeign', e.target.value)} />
                  <select className="text-input" aria-label="Currency" value={cur} onChange={(e) => set('foreignCurrency', e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </span>
              </div>
              <div className="money-row">
                <span className="money-label" id="lbl-self">Your family can cover</span>
                <input id="selfFinancedLkr" className="text-input" inputMode="numeric" aria-labelledby="lbl-self" placeholder="0"
                  value={a.selfFinancedLkr} onChange={(e) => set('selfFinancedLkr', e.target.value)} aria-invalid={errFor('selfFinancedLkr') ? true : undefined} />
                <span className="money-foreign">
                  <input className="text-input" inputMode="numeric" aria-label="Family can cover, foreign part" placeholder="0"
                    value={a.selfFinancedForeign} onChange={(e) => set('selfFinancedForeign', e.target.value)} />
                  <span className="money-cur">{cur}</span>
                </span>
              </div>
              <div className="money-row total" aria-live="polite">
                <span className="money-label">You’re asking the trust for</span>
                <strong>Rs {fmt(req.lkr)}</strong>
                <strong>{req.foreign ? `${fmt(req.foreign)} ${cur}` : '—'}</strong>
              </div>
            </div>
            <span id="hint-lkr" className="sr-only">Numbers only; commas are fine.</span>
            {(errFor('totalFeeLkr') || errFor('selfFinancedLkr')) && <p className="scene-error" role="alert">{errFor('totalFeeLkr') || errFor('selfFinancedLkr')}</p>}

            <Chips name="assistanceKind" label="What kind of help?" value={a.assistanceKind} onPick={(v) => set('assistanceKind', v as Answers['assistanceKind'])}
              error={errFor('assistanceKind-0')}
              options={[{ value: 'grant', label: 'A grant' }, { value: 'loan', label: 'A loan' }, { value: 'either', label: 'Either is fine' }]} />

            <div className="field">
              <div className="field-label">When is the money needed?</div>
              <p className="field-hint">One line per payment — e.g. “Year 2 — Semester 1”, the month it’s due, the amount, and who pays it.</p>
            </div>
            {a.plan.map((p, i) => (
              <fieldset key={p.id} className="record plan">
                <legend>Payment {i + 1}</legend>
                <div className="record-grid">
                  <TextField id={`plan-label-${p.id}`} label="What for" value={p.label} onChange={(v) => setPlan(p.id, 'label', v)}
                    placeholder="e.g. Year 2 — Semester 1" error={errFor(`plan-label-${p.id}`)} />
                  <TextField id={`plan-when-${p.id}`} label="Due" type="month" value={p.when} onChange={(v) => setPlan(p.id, 'when', v)} />
                  <TextField id={`plan-lkr-${p.id}`} label="Rupees" inputMode="numeric" value={p.amountLkr} onChange={(v) => setPlan(p.id, 'amountLkr', v)} placeholder="e.g. 220,000" />
                  <TextField id={`plan-fx-${p.id}`} label={`${cur} (if any)`} inputMode="numeric" value={p.amountForeign} onChange={(v) => setPlan(p.id, 'amountForeign', v)} placeholder="0" />
                </div>
                <Chips name={`plan-payer-${p.id}`} label="Who pays this one?" value={p.payer} onPick={(v) => setPlan(p.id, 'payer', v)}
                  options={[{ value: 'trust', label: 'Asking the trust' }, { value: 'self', label: 'My family' }]} />
                {a.plan.length > 1 && (
                  <button type="button" className="btn-text record-remove" onClick={() => set('plan', a.plan.filter((x) => x.id !== p.id))}>Remove this payment</button>
                )}
              </fieldset>
            ))}
            <button type="button" className="add-row" onClick={() => set('plan', [...a.plan, { id: newId(), label: '', when: '', amountLkr: '', amountForeign: '', payer: 'trust' }])}>
              + Add another payment
            </button>
          </>
        );
        break;
      case 9:
        prompt = 'Your family, in plain terms.';
        sub = 'Help the trustees understand your parents’ situation and why the cost is out of reach. Held in confidence — only the trustees see this.';
        control = (
          <>
            <TextField id="familySituation" label="Your family’s situation" hideLabel textarea rows={7} value={a.familySituation}
              onChange={(v) => set('familySituation', v)} error={errFor('familySituation')}
              placeholder="e.g. My father is a three-wheeler driver and my mother sews at home. We are four children, and the course fee is more than our yearly income…" />
            <FileField id="incomeProof" label="Anything that shows family income — a salary slip or GS certificate" optional
              file={files.incomeProof} onChange={setFile('incomeProof')} error={errFor('incomeProof')} />
          </>
        );
        break;
      case 10: {
        const fileCount = [files.photo, files.idFile, files.feeSchedule, files.incomeProof, ...Object.values(files.edu)].filter(Boolean).length;
        prompt = 'Ready? Check, then sign.';
        sub = 'Tap any section to change it.';
        control = (
          <>
            <ul className="review">
              <ReviewItem title="Your profile" onEdit={() => editFromReview(1)}>
                {a.fullName} · {[a.phone, a.email].filter(Boolean).join(' · ')}{a.dateOfBirth && ` · born ${a.dateOfBirth}`}
                {!files.photo && <span className="warn"> · photo needed</span>}
              </ReviewItem>
              <ReviewItem title="Education" onEdit={() => editFromReview(4)}>
                {a.school}{a.education.filter((e) => e.level).length ? ` · ${a.education.filter((e) => e.level).map((e) => `${e.level} ${e.year}`.trim()).join(', ')}` : ''}
              </ReviewItem>
              <ReviewItem title="Future plans" onEdit={() => editFromReview(6)}>{a.ambition.slice(0, 140)}{a.ambition.length > 140 ? '…' : ''}</ReviewItem>
              <ReviewItem title="Programme" onEdit={() => editFromReview(7)}>
                {a.courseTitle}{a.institution && ` · ${a.institution}`}{a.durationYears && ` · ${a.durationYears} yr`}
              </ReviewItem>
              <ReviewItem title="Asking the trust for" onEdit={() => editFromReview(8)}>
                <strong>Rs {fmt(req.lkr)}{req.foreign ? ` + ${fmt(req.foreign)} ${cur}` : ''}</strong>
                {a.assistanceKind && ` as ${a.assistanceKind === 'either' ? 'a grant or loan' : `a ${a.assistanceKind}`}`}
              </ReviewItem>
              <ReviewItem title="Documents" onEdit={() => editFromReview(3)}>
                {fileCount ? `${fileCount} attached` : 'None attached'}{resumed && fileCount === 0 && ' — files need attaching again after leaving'}
              </ReviewItem>
            </ul>

            <fieldset className="declare">
              <legend>Declaration</legend>
              {([
                ['declTruthful', 'Everything I’ve written is true and complete, to the best of my knowledge.'],
                ['declWilling', 'I’m applying willingly — nobody has pressured me to apply.'],
                ['declInterview', 'I understand the trustees may invite me to an interview, and that my answers and documents are seen only by them. I can ask for them to be deleted at any time.'],
              ] as const).map(([k, text], i) => (
                <label key={k} className="consent">
                  <input id={i === 0 ? 'declTruthful' : undefined} type="checkbox" checked={a[k]} onChange={(e) => set(k, e.target.checked)} />
                  <span>{text}</span>
                </label>
              ))}
              {errFor('declTruthful') && <p className="scene-error" role="alert">{errFor('declTruthful')}</p>}
            </fieldset>
            <TextField id="signatureName" label="Sign by typing your full name" value={a.signatureName} onChange={(v) => set('signatureName', v)}
              placeholder={a.fullName || 'Your full name'} error={errFor('signatureName')} autoComplete="name" />
            <p className="field-hint">Dated {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

            <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />
            {sendError && <p className="scene-error" role="alert">{sendError}</p>}
          </>
        );
        break;
      }
    }

    const sendingLabel = sending
      ? sending.total > 1 && sending.done < sending.total - 1
        ? `Uploading ${sending.done + 1} of ${sending.total - 1}…`
        : 'Sending…'
      : 'Send my application';

    content = (
      <form className="scene" key={`scene-${scene}`} noValidate aria-labelledby="scene-q"
        onSubmit={(e) => {
          e.preventDefault();
          if (final) send();
          else next();
        }}>
        <div className="scene-kicker scene-rise">{STAGES[stage]} · {SCENES[scene - 1].name}</div>
        <h2 id="scene-q" className="scene-rise-d1" tabIndex={-1}>{prompt}</h2>
        {sub && <p className="scene-sub scene-rise-d2">{sub}</p>}
        {scene === 1 && resumed && (
          <p className="scene-sub scene-rise-d2">
            Welcome back — your earlier answers are still here (photos and documents need adding again).{' '}
            <button type="button" className="btn-text inline-link" onClick={startOver}>Start over</button>
          </p>
        )}
        <div className="scene-control scene-rise-d3">{control}</div>
        <div className="scene-foot scene-rise-d4">
          {scene > 1 ? (
            <button type="button" onClick={() => go(scene - 1)} className="btn-text cta-back" disabled={!!sending}>
              <span className="cta-icon" aria-hidden="true">←</span> Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-dark cta" disabled={!!sending}>
            {final ? sendingLabel : reviewReturn.current ? 'Back to review' : 'Continue'} <span className="cta-icon" aria-hidden="true">→</span>
          </button>
        </div>
        {scene === 1 && (
          <p className="scene-hint scene-rise-d4">About fifteen minutes. Your answers stay on this device until you send them, so you can leave and come back.</p>
        )}
      </form>
    );
  }

  return (
    <div className="journey" role="dialog" aria-modal="true" aria-label="Scholarship application">
      <div className="journey-backdrop" />
      <div className="journey-progress-line" style={{ width: `${progress * 100}%` }} aria-hidden="true" />

      <svg className="journey-stem" viewBox="0 0 80 800" preserveAspectRatio="none" aria-hidden="true">
        <path className="stem" d="M40 780 Q 20 640 40 500 Q 60 360 40 220 Q 20 80 40 20" stroke="var(--sage)" strokeWidth="1.5"
          fill="none" opacity="0.45" strokeDasharray="900" strokeDashoffset={stemOffset} />
        {LEAF_YS.map((y, i) => (
          <g key={y} transform={`translate(40 ${y})`} opacity={stage > i ? 1 : 0.05}>
            <path d="M0 0 C -14 -6 -22 -18 -20 -30 C -6 -22 4 -12 0 0 Z" fill="var(--sage-soft)" opacity="0.9" />
          </g>
        ))}
      </svg>

      <div className="journey-bar">
        <div className="journey-count" aria-live="polite">
          <div className="name">{done ? 'Sent' : STAGES[stage]}</div>
          {!done && (
            <div className="num">
              <em>{String(stage + 1).padStart(2, '0')}</em> · of · {String(STAGES.length).padStart(2, '0')}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="journey-leave">{done ? 'Close' : 'Leave · come back later'}</button>
      </div>

      <div className="journey-stage" ref={stageRef}>{content}</div>
    </div>
  );
}

function ReviewItem({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onEdit}>
        <span className="t">{title}</span>
        <span className="v">{children || <span className="warn">Not filled in</span>}</span>
        <span className="e" aria-hidden="true">Change</span>
      </button>
    </li>
  );
}
