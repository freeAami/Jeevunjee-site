import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CONTACT_EMAIL } from '../content';
import {
  clearDraft, emptyAnswers, hasAnswers, loadDraft, MAX_FILE_BYTES, MAX_IMAGE_BYTES, saveDraft, submitApplication, TOTAL_STEPS,
  type Answers, type Files, type Situation, type SubmitResult,
} from '../lib/application';
import { Choices, FileField, TextField } from './fields';

type FieldError = { field: string; msg: string } | null;

const STEP_NAMES = ['Your name', 'Contact', 'Your situation', 'Where', 'Your family', 'What for', 'Your story', 'Documents'];
const LEAF_YS = [700, 560, 420, 280, 140];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(step: number, a: Answers, files: Files): FieldError {
  switch (step) {
    case 1:
      return a.fullName.trim() ? null : { field: 'fullName', msg: 'Please tell us what to call you.' };
    case 2:
      if (a.email.trim() && !EMAIL_RE.test(a.email.trim())) return { field: 'email', msg: 'That email address doesn’t look quite right.' };
      if (!a.email.trim() && !a.phone.trim()) return { field: 'email', msg: 'We need one way to reach you — an email or a phone number.' };
      return null;
    case 3:
      return a.situation ? null : { field: 'situation-0', msg: 'Choose whichever fits closest.' };
    case 4:
      return a.institution.trim() || a.course.trim()
        ? null
        : { field: a.situation === 'never' ? 'course' : 'institution', msg: 'A rough answer is enough.' };
    case 6:
      return a.fundingFor.trim() ? null : { field: 'fundingFor', msg: 'Tell us roughly what the support would pay for.' };
    case 7:
      return a.story.trim() ? null : { field: 'story', msg: 'Even a few lines is enough. This is the part we read most carefully.' };
    case 8:
      if (!files.idFile) return { field: 'idFile', msg: 'Please add a photo of your National ID or birth certificate.' };
      return a.consent ? null : { field: 'consent', msg: 'Please confirm to send.' };
    default:
      return null;
  }
}

export function Journey({ onClose }: { onClose: () => void }) {
  const [draft] = useState(loadDraft);
  const [answers, setAnswers] = useState<Answers>(draft?.answers ?? emptyAnswers);
  const [step, setStep] = useState(draft?.step ?? 1);
  const [resumed, setResumed] = useState(!!draft && hasAnswers(draft.answers));
  const [files, setFiles] = useState<Files>({ idFile: null, transcriptFile: null });
  const [error, setError] = useState<FieldError>(null);
  const [sendError, setSendError] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const done = result !== null;

  // Keep a draft on this device so "Leave · come back later" is true.
  useEffect(() => {
    if (!done && hasAnswers(answers)) saveDraft({ answers, step });
  }, [answers, step, done]);

  // Escape leaves (the draft is already saved).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  // Move focus into each new scene: straight to the first field on desktop, to the question on touch
  // (so the keyboard doesn't jump up before the question has been read).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.closest('.journey')?.scrollTo({ top: 0 });
    const fine = window.matchMedia('(pointer: fine)').matches;
    const target = fine
      ? stage.querySelector<HTMLElement>('input:not([type=file]):not([type=checkbox]), textarea, [role=radio], h2')
      : stage.querySelector<HTMLElement>('h2');
    target?.focus({ preventScroll: true });
  }, [step, done]);

  const set = useCallback(<K extends keyof Answers>(k: K, v: Answers[K]) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    setError((e) => (e && (e.field === k || e.field.startsWith(k)) ? null : e));
  }, []);

  const focusField = (id: string) => document.getElementById(id)?.focus();

  const next = () => {
    const err = validate(step, answers, files);
    if (err) {
      setError(err);
      focusField(err.field);
      return;
    }
    setError(null);
    setResumed(false);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const back = () => {
    clearTimeout(advanceTimer.current);
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const send = async () => {
    const err = validate(8, answers, files);
    if (err) {
      setError(err);
      focusField(err.field);
      return;
    }
    setSending(true);
    setSendError(false);
    try {
      const r = await submitApplication(answers, files, honeypot);
      clearDraft();
      setResult(r);
    } catch {
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    clearDraft();
    setAnswers(emptyAnswers);
    setFiles({ idFile: null, transcriptFile: null });
    setResumed(false);
    setError(null);
    setStep(1);
  };

  const pickSituation = (v: Situation) => {
    set('situation', v);
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(() => {
      setResumed(false);
      setStep(4);
    }, 350);
  };

  const setFile = (k: keyof Files) => (f: File | null) => {
    if (f && f.size > (f.type.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_FILE_BYTES)) {
      setError({ field: k, msg: 'That file is too large to send. A photo taken with your phone camera will work.' });
      return;
    }
    setFiles((fs) => ({ ...fs, [k]: f }));
    setError((e) => (e?.field === k ? null : e));
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

  // ---- environment: stem grows, leaves open as answers accumulate ----
  const progress = done ? 1 : Math.min(step / TOTAL_STEPS, 1);
  const stemOffset = 900 - Math.round(900 * progress);
  const errFor = (f: string) => (error?.field === f ? error.msg : undefined);

  const a = answers;
  let scene: ReactNode;

  if (done) {
    scene = (
      <div className="scene resolution" key="done">
        <div className="scene-kicker scene-rise">Received</div>
        <h2 className="serif scene-rise-d1" tabIndex={-1}>Thank you. It has come through.</h2>
        <p className="lede scene-rise-d2">
          We'll take time to read what you've shared. The Committee will write to you — whether it's a yes, a no, or a
          question.
        </p>
        {result.preview && (
          <p className="preview-note" role="note">
            Preview mode: no submission endpoint is configured, so this application was not sent anywhere.
          </p>
        )}
        <div className="scene-rise-d3">
          <div className="ref-card">
            <div className="label">Your reference number</div>
            <div className="ref">{result.reference}</div>
          </div>
          <button type="button" className="btn-text ref-copy" onClick={copyRef} aria-live="polite">
            {copied ? 'Copied' : 'Copy number'}
          </button>
          <div className="keep">Keep this number. It is how you write to us, and how we find your file quickly.</div>
        </div>
        <button type="button" onClick={onClose} className="btn btn-dark cta scene-rise-d4">Return home</button>
      </div>
    );
  } else {
    let prompt = '';
    let sub = '';
    let control: ReactNode = null;
    let final = false;

    switch (step) {
      case 1:
        prompt = 'First — what should we call you?';
        sub = "The name you'd like the Committee to use when writing back.";
        control = (
          <TextField id="fullName" label="Your name" hideLabel big value={a.fullName} onChange={(v) => set('fullName', v)}
            placeholder="e.g. Nimal Perera" autoComplete="name" error={errFor('fullName')} />
        );
        break;
      case 2:
        prompt = 'How can we reach you?';
        sub = 'One of these is enough. WhatsApp is fine on the phone number.';
        control = (
          <>
            <TextField id="email" label="Email" type="email" big value={a.email} onChange={(v) => set('email', v)}
              placeholder="you@example.com" autoComplete="email" inputMode="email" error={errFor('email')} />
            <TextField id="phone" label="Phone / WhatsApp" type="tel" value={a.phone} onChange={(v) => set('phone', v)}
              placeholder="e.g. 077 123 4567" autoComplete="tel" inputMode="tel" />
            <TextField id="location" label="City or district" optional value={a.location} onChange={(v) => set('location', v)}
              placeholder="e.g. Kandy" autoComplete="address-level2" />
          </>
        );
        break;
      case 3:
        prompt = 'Where are you in your education right now?';
        sub = "Pick whichever fits closest. There's no wrong answer.";
        control = (
          <Choices
            name="situation"
            label={prompt}
            value={a.situation}
            onPick={(v) => pickSituation(v as Situation)}
            error={errFor('situation-0')}
            options={[
              { value: 'enrolled', label: 'I am in school or university now', hint: 'And I am worried about being able to continue.' },
              { value: 'stopped', label: 'I had to stop my education', hint: 'For financial reasons, and I want to return.' },
              { value: 'never', label: 'I never had a proper chance to go', hint: 'And I want a way in.' },
              { value: 'talent', label: 'I am developing a talent', hint: 'A sport, music, art, a craft — and support is out of reach.' },
            ]}
          />
        );
        break;
      case 4:
        if (a.situation === 'never') {
          prompt = 'What would you like to study, or train in?';
          sub = "A rough idea is enough. If there's a school or programme you have in mind, name it too.";
          control = (
            <>
              <TextField id="course" label="What you'd like to study or train in" big value={a.course} onChange={(v) => set('course', v)}
                placeholder="e.g. Finishing my O/Levels, or a nursing diploma" error={errFor('course')} />
              <TextField id="institution" label="A school or programme you have in mind" optional value={a.institution}
                onChange={(v) => set('institution', v)} placeholder="e.g. a technical college near Galle" />
            </>
          );
        } else {
          const talent = a.situation === 'talent';
          prompt = talent ? 'Where do you train, and in what?' : 'Which school, university, or programme?';
          sub = "The name is enough. If you're not currently attending, the last one you were at.";
          control = (
            <>
              <TextField id="institution" label={talent ? 'Where you train' : 'School, university, or programme'} big
                value={a.institution} onChange={(v) => set('institution', v)}
                placeholder={talent ? 'e.g. Colombo Athletics Club' : 'e.g. Royal College, Colombo'} error={errFor('institution')} />
              <TextField id="course" label={talent ? 'Discipline' : 'Course or subjects'} optional value={a.course}
                onChange={(v) => set('course', v)}
                placeholder={talent ? 'e.g. Track & field, 400m' : 'e.g. Advanced Level science stream'} />
            </>
          );
        }
        break;
      case 5:
        prompt = 'Your family, in plain terms.';
        sub = 'Held in confidence. Only the Committee sees this. Estimates are fine — skip anything you are unsure of.';
        control = (
          <>
            <TextField id="household" label="How many people live in your home?" big value={a.household}
              onChange={(v) => set('household', v)} placeholder="e.g. 5" inputMode="numeric" />
            <TextField id="income" label="Roughly, monthly household income (LKR)" value={a.income}
              onChange={(v) => set('income', v)} placeholder="e.g. 35,000" inputMode="numeric" />
          </>
        );
        break;
      case 6:
        prompt = 'If we can help — what is the money for?';
        sub = 'Fees, books, transport, exam registration, equipment, living costs. Be specific.';
        control = (
          <>
            <TextField id="fundingFor" label="What it would pay for" textarea rows={4} value={a.fundingFor}
              onChange={(v) => set('fundingFor', v)} error={errFor('fundingFor')}
              placeholder="For example: A/L exam fees, one term of tuition, transport to Colombo…" />
            <TextField id="amountNeeded" label="Roughly, how much would help? (LKR)" optional value={a.amountNeeded}
              onChange={(v) => set('amountNeeded', v)} placeholder="e.g. 60,000" inputMode="numeric" />
          </>
        );
        break;
      case 7:
        prompt = 'Tell us about you — in your own words.';
        sub = "What you're working toward, what stopped or is stopping you, what you'd do if this came through. Sinhala, Tamil, or English — whichever is easiest.";
        control = (
          <TextField id="story" label="Your story" hideLabel textarea rows={9} value={a.story} onChange={(v) => set('story', v)}
            error={errFor('story')} placeholder="Take your time. There is no word count. This is the part we read most carefully." />
        );
        break;
      case 8:
        final = true;
        prompt = 'One last thing — documents.';
        sub = 'Phone photos are completely fine. Everything is kept in a private folder that only the Committee can open.';
        control = (
          <>
            <FileField id="idFile" label="National ID or birth certificate" file={files.idFile} onChange={setFile('idFile')} error={errFor('idFile')} />
            <FileField id="transcriptFile" label="School record or transcript" optional file={files.transcriptFile}
              onChange={setFile('transcriptFile')} error={errFor('transcriptFile')} />
            <label className="consent">
              <input id="consent" type="checkbox" checked={a.consent} onChange={(e) => set('consent', e.target.checked)} />
              <span>
                I understand my answers and documents are kept privately and seen only by the Scholarship Committee, and
                that I can ask for them to be deleted at any time. <span className="muted">I agree.</span>
              </span>
            </label>
            {errFor('consent') && <p className="scene-error" role="alert">{errFor('consent')}</p>}
            {/* Spam trap: hidden from people, but bots fill in every field. */}
            <input type="text" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />
            {sendError && (
              <p className="scene-error" role="alert">
                We couldn't send your application just now. Please check your connection and try again — your answers are
                still here.
                {CONTACT_EMAIL ? (
                  <> If it keeps happening, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>
                ) : (
                  ' If it keeps happening, try again a little later.'
                )}
              </p>
            )}
          </>
        );
        break;
    }

    const nextLabel = final ? (sending ? 'Sending…' : a.consent ? 'Ready — send it' : 'Please confirm to send') : 'Continue';

    scene = (
      <form
        className="scene"
        key={`scene-${step}`}
        noValidate
        aria-labelledby="scene-q"
        onSubmit={(e) => {
          e.preventDefault();
          if (final) send();
          else next();
        }}
      >
        <div className="scene-kicker scene-rise">Question {step}</div>
        <h2 id="scene-q" className="scene-rise-d1" tabIndex={-1}>{prompt}</h2>
        {sub && <p className="scene-sub scene-rise-d2">{sub}</p>}
        {step === 1 && resumed && (
          <p className="scene-sub scene-rise-d2">
            Welcome back — your earlier answers are still here.{' '}
            <button type="button" className="btn-text" style={{ display: 'inline', padding: 0, textDecoration: 'underline', fontSize: 'inherit' }} onClick={startOver}>
              Start over
            </button>
          </p>
        )}
        <div className="scene-control scene-rise-d3">{control}</div>
        <div className="scene-foot scene-rise-d4">
          {step > 1 ? (
            <button type="button" onClick={back} className="btn-text cta-back">
              <span className="cta-icon" aria-hidden="true">←</span> Back
            </button>
          ) : (
            <span />
          )}
          {step !== 3 && (
            <button type="submit" className="btn btn-dark cta" disabled={final && (!a.consent || sending)}>
              {nextLabel} <span className="cta-icon" aria-hidden="true">→</span>
            </button>
          )}
        </div>
        {step === 1 && (
          <p className="scene-hint scene-rise-d4">Your answers stay on this device until you send them, so you can leave and come back.</p>
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
          <g key={y} transform={`translate(40 ${y})`} opacity={done || step > i ? 1 : 0.05}>
            <path d="M0 0 C -14 -6 -22 -18 -20 -30 C -6 -22 4 -12 0 0 Z" fill="var(--sage-soft)" opacity="0.9" />
          </g>
        ))}
      </svg>

      <div className="journey-bar">
        <div className="journey-count" aria-live="polite">
          <div className="name">{done ? 'Sent' : STEP_NAMES[step - 1]}</div>
          {!done && (
            <div className="num">
              <em>{String(step).padStart(2, '0')}</em> · of · {String(TOTAL_STEPS).padStart(2, '0')}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="journey-leave">
          {done ? 'Close' : 'Leave · come back later'}
        </button>
      </div>

      <div className="journey-stage" ref={stageRef}>{scene}</div>
    </div>
  );
}
