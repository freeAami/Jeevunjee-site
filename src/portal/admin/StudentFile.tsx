import { useMemo, useRef, useState } from 'react';
import { ACCEPT_ATTR, ACCEPT_IMAGES, acceptsFile, fileTooLarge } from '../../lib/files';
import { friendlyError } from '../api';
import { dueState, fmtAmount, fmtBytes, fmtDate, fmtLkr, fmtMixed, relativeDue, sumMixed } from '../format';
import {
  DOC_CATEGORIES, STUDENT_UPLOAD_CATEGORIES, type Course, type DocCategory, type DocumentRec, type Instalment, type Payment,
  type StudentBundle,
} from '../types';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Loading, useAsync, usePortal } from '../ui';
import { CourseForm, InstalmentForm, PaymentForm, StudentForm } from './forms';

type Tab = 'payments' | 'details' | 'documents' | 'notes' | 'login';

function tabFromHash(): Tab | null {
  const m = location.hash.match(/[?&]tab=(\w+)/);
  return (m?.[1] as Tab) ?? null;
}

export function StudentFile({ studentId }: { studentId: string }) {
  const { api, profile } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadStudent(studentId), [api, studentId]);
  const [tab, setTab] = useState<Tab>(tabFromHash() ?? 'payments');
  const isAdmin = profile.role === 'admin';

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load this student'} onRetry={reload} />;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'payments', label: 'Course & payments' },
    { id: 'details', label: 'Details' },
    { id: 'documents', label: `Documents (${data.documents.length})` },
    ...(isAdmin ? [{ id: 'notes' as Tab, label: `Notes (${data.notes.length})` }, { id: 'login' as Tab, label: 'Login' }] : []),
  ];

  return (
    <div className="ppage">
      {isAdmin && <a className="pback" href="#/portal/students">← All students</a>}
      <Header data={data} reload={reload} />
      <Summary data={data} />

      <div className="ptabs" role="tablist" aria-label="Student file">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'payments' && <PaymentsTab data={data} reload={reload} />}
        {tab === 'details' && <DetailsTab data={data} reload={reload} />}
        {tab === 'documents' && <DocumentsTab data={data} reload={reload} />}
        {tab === 'notes' && isAdmin && <NotesTab data={data} reload={reload} />}
        {tab === 'login' && isAdmin && <LoginTab data={data} reload={reload} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

function Header({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { api, profile } = usePortal();
  const s = data.student;
  const isAdmin = profile.role === 'admin';
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const trustName = new Map(data.trusts.map((t) => [t.id, t.name]));
  const trusts = [...new Set(data.courses.map((c) => c.trust_id && trustName.get(c.trust_id)).filter(Boolean))] as string[];
  const wa = (s.whatsapp || s.phone || '').replace(/\D/g, '').replace(/^0/, '94');

  return (
    <header className="pfile-head">
      <div className="pfile-photo">
        <Avatar student={s} size={88} />
        {isAdmin && (
          <>
            <button type="button" className="pfile-photo-btn" onClick={() => photoInput.current?.click()} disabled={photoBusy}>
              {photoBusy ? 'Uploading…' : s.photo_path ? 'Change photo' : 'Add photo'}
            </button>
            <input ref={photoInput} type="file" accept={ACCEPT_IMAGES} className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!acceptsFile(f) || !f.type.startsWith('image/')) return setPhotoErr('Please choose a photo (JPEG, PNG or HEIC).');
                setPhotoBusy(true);
                setPhotoErr('');
                try {
                  await api.setStudentPhoto(s.id, f);
                  reload();
                } catch (err) {
                  setPhotoErr(friendlyError(err));
                } finally {
                  setPhotoBusy(false);
                }
              }} />
          </>
        )}
      </div>
      <div className="pfile-id">
        <h1>{s.full_name}</h1>
        <div className="pfile-meta">
          <span className="code">{s.code}</span>
          {s.preferred_name && <span>Known as {s.preferred_name}</span>}
          <Badge tone={s.status === 'active' ? 'paid' : 'neutral'}>{s.status}</Badge>
          {trusts.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
        </div>
        <div className="pfile-contact">
          {s.phone && <a href={`tel:${s.phone}`}>{s.phone}</a>}
          {wa.length >= 9 && <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
          {s.city && <span>{s.city}</span>}
        </div>
        {photoErr && <p className="perror" role="alert">{photoErr}</p>}
      </div>
    </header>
  );
}

function Summary({ data }: { data: StudentBundle }) {
  const v = useMemo(() => {
    const fees = sumMixed(data.courses.map((c) => ({ lkr: c.total_fee_lkr, foreign: c.total_fee_foreign, currency: c.foreign_currency })));
    const trustPaid = data.payments.filter((p) => p.trust_id).reduce((n, p) => n + Number(p.total_lkr || 0), 0);
    const due = data.instalments.filter((i) => i.status === 'due' && i.funded_by === 'trust');
    const remaining = sumMixed(due.map((i) => ({ lkr: i.amount_lkr, foreign: i.amount_foreign, currency: i.foreign_currency })));
    const next = [...due].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
    return { fees, trustPaid, remaining, next };
  }, [data]);
  return (
    <div className="pstats compact">
      <div className="pstat"><span className="label">Course fees</span><span className="value small">{fmtMixed(v.fees)}</span></div>
      <div className="pstat"><span className="label">Paid by the trust</span><span className="value small">{fmtLkr(v.trustPaid)}</span></div>
      <div className="pstat"><span className="label">Still to pay</span><span className="value small">{fmtMixed(v.remaining)}</span></div>
      <div className={`pstat${v.next && dueState(v.next) === 'overdue' ? ' alert' : ''}`}>
        <span className="label">Next due</span>
        <span className="value small">{v.next ? fmtAmount(v.next.amount_lkr, v.next.amount_foreign, v.next.foreign_currency) : '—'}</span>
        <span className="foot">{v.next ? `${v.next.label} · ${relativeDue(v.next.due_date)}` : 'Nothing outstanding'}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------

type Editing =
  | { kind: 'course'; course?: Course }
  | { kind: 'instalment'; instalment?: Instalment; courseId?: string }
  | { kind: 'payment'; payment?: Payment; instalmentId?: string }
  | null;

function PaymentsTab({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { profile } = usePortal();
  const isAdmin = profile.role === 'admin';
  const [editing, setEditing] = useState<Editing>(null);
  const trustName = new Map(data.trusts.map((t) => [t.id, t.name]));
  const instLabel = new Map(data.instalments.map((i) => [i.id, i.label]));
  const done = () => {
    setEditing(null);
    reload();
  };

  return (
    <>
      {data.courses.length === 0 && (
        <Card>
          <Empty>{isAdmin ? 'No course yet. Add the course the trust is supporting, then its payment schedule.' : 'No course has been added to your file yet.'}</Empty>
          {isAdmin && <Button variant="primary" onClick={() => setEditing({ kind: 'course' })}>+ Add course</Button>}
        </Card>
      )}

      {data.courses.map((c) => {
        const rows = data.instalments.filter((i) => i.course_id === c.id);
        return (
          <Card key={c.id} className="pcourse"
            title={<>{c.title}{c.status !== 'ongoing' && <Badge>{c.status}</Badge>}</>}
            actions={isAdmin && <Button small onClick={() => setEditing({ kind: 'course', course: c })}>Edit course</Button>}>
            <dl className="pfacts">
              <div><dt>Where</dt><dd>{[c.institution, c.awarding_body].filter(Boolean).join(' · ') || '—'}</dd></div>
              <div><dt>Funded by</dt><dd>{(c.trust_id && trustName.get(c.trust_id)) || '—'}</dd></div>
              <div><dt>Started</dt><dd>{fmtDate(c.start_date)}</dd></div>
              <div><dt>Length</dt><dd>{c.duration_years ? `${c.duration_years} year${c.duration_years === 1 ? '' : 's'}` : '—'}</dd></div>
              <div><dt>Billing</dt><dd>{c.payment_plan || '—'}</dd></div>
              <div><dt>Total fee</dt><dd>{fmtAmount(c.total_fee_lkr, c.total_fee_foreign, c.foreign_currency)}</dd></div>
            </dl>

            <h3 className="psub">Payment schedule</h3>
            {rows.length ? (
              <div className="ptable-wrap">
                <table className="ptable">
                  <thead>
                    <tr><th>For</th><th>Due</th><th className="num">Amount</th><th>Who pays</th><th>Status</th>{isAdmin && <th><span className="sr-only">Actions</span></th>}</tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      const st = dueState(i);
                      return (
                        <tr key={i.id} className={st === 'overdue' ? 'row-alert' : undefined}>
                          <td>{i.label}{i.notes && <small className="pnote">{i.notes}</small>}</td>
                          <td>{fmtDate(i.due_date)}</td>
                          <td className="num">{fmtAmount(i.amount_lkr, i.amount_foreign, i.foreign_currency)}</td>
                          <td>{i.funded_by === 'self' ? 'Family' : 'Trust'}</td>
                          <td>
                            <Badge tone={st === 'paid' ? 'paid' : st === 'overdue' ? 'overdue' : st === 'soon' ? 'soon' : 'neutral'}>
                              {st === 'paid' ? 'Paid' : st === 'cancelled' ? 'Cancelled' : relativeDue(i.due_date)}
                            </Badge>
                          </td>
                          {isAdmin && (
                            <td className="pactions">
                              {i.status === 'due' && <Button small variant="primary" onClick={() => setEditing({ kind: 'payment', instalmentId: i.id })}>Log payment</Button>}
                              <Button small variant="quiet" onClick={() => setEditing({ kind: 'instalment', instalment: i })} aria-label={`Edit ${i.label}`}>Edit</Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No instalments yet.</Empty>
            )}
            {isAdmin && <Button small onClick={() => setEditing({ kind: 'instalment', courseId: c.id })}>+ Add instalment</Button>}
          </Card>
        );
      })}

      {isAdmin && data.courses.length > 0 && (
        <div className="prow-actions">
          <Button onClick={() => setEditing({ kind: 'course' })}>+ Add another course</Button>
        </div>
      )}

      <Card title="Payment history" actions={isAdmin && data.courses.length > 0 && <Button small variant="primary" onClick={() => setEditing({ kind: 'payment' })}>Log a payment</Button>}>
        {data.payments.length ? (
          <div className="ptable-wrap">
            <table className="ptable">
              <thead>
                <tr><th>Date</th><th>For</th><th className="num">Amount</th><th className="num">Rate</th><th className="num">Cost in rupees</th><th>Paid by</th><th>Details</th>{isAdmin && <th><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.paid_on)}</td>
                    <td>{(p.instalment_id && instLabel.get(p.instalment_id)) || '—'}</td>
                    <td className="num">{fmtAmount(p.amount_lkr, p.amount_foreign, p.foreign_currency)}</td>
                    <td className="num">{p.amount_foreign ? (p.fx_rate ? `${p.fx_rate} / ${p.foreign_currency}` : <Badge tone="soon">Not set</Badge>) : '—'}</td>
                    <td className="num">{fmtLkr(p.total_lkr)}</td>
                    <td>{(p.trust_id && trustName.get(p.trust_id)) || 'Family'}</td>
                    <td className="pdetails">{[p.method, p.paid_to, p.reference].filter(Boolean).join(' · ') || '—'}{p.notes && <small className="pnote">{p.notes}</small>}</td>
                    {isAdmin && <td className="pactions"><Button small variant="quiet" onClick={() => setEditing({ kind: 'payment', payment: p })}>Edit</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payments recorded yet.</Empty>
        )}
      </Card>

      {editing?.kind === 'course' && (
        <CourseForm studentId={data.student.id} trusts={data.trusts} course={editing.course} onClose={() => setEditing(null)} onSaved={done} />
      )}
      {editing?.kind === 'instalment' && (
        <InstalmentForm courses={data.courses} instalment={editing.instalment} defaultCourseId={editing.courseId}
          onClose={() => setEditing(null)} onSaved={done} />
      )}
      {editing?.kind === 'payment' && (
        <PaymentForm studentId={data.student.id} courses={data.courses} instalments={data.instalments} trusts={data.trusts}
          payment={editing.payment} instalmentId={editing.instalmentId} onClose={() => setEditing(null)} onSaved={done} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------

function DetailsTab({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { profile } = usePortal();
  const [editing, setEditing] = useState(false);
  const s = data.student;
  const rows: [string, string | null][] = [
    ['Full name', s.full_name], ['Known as', s.preferred_name], ['Student code', s.code], ['Date of birth', s.date_of_birth && fmtDate(s.date_of_birth)],
    ['NIC / ID number', s.nic], ['Phone', s.phone], ['WhatsApp', s.whatsapp], ['Email', s.email], ['Address', s.address],
    ['City / district', s.city], ['School', s.school], ['Parents / guardians', s.guardian_details],
    ['Family financial situation', s.family_situation], ['Ambition and goals', s.ambition],
  ];
  return (
    <Card title="Personal details" actions={profile.role === 'admin' && <Button small onClick={() => setEditing(true)}>Edit</Button>}>
      <dl className="pdetails-list">
        {rows.map(([k, val]) => (
          <div key={k}><dt>{k}</dt><dd>{val || <span className="muted">—</span>}</dd></div>
        ))}
      </dl>
      {profile.role === 'admin' && s.application_id && (
        <p className="pfoot-link"><a href={`#/portal/applications/${s.application_id}`}>View their original application →</a></p>
      )}
      {profile.role === 'student' && <p className="pfoot-link muted">Something out of date? Tell a trustee and they’ll update it.</p>}
      {editing && <StudentForm student={s} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------

export function openFile(api: { fileUrl: (b: string, p: string) => Promise<string> }, bucket: string, path: string, onError: (m: string) => void) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the signed link.
  const w = window.open('', '_blank');
  // The file was uploaded by someone outside the trust: never let its tab reach back into the portal.
  if (w) w.opener = null;
  api.fileUrl(bucket, path).then(
    (url) => {
      if (w) w.location.href = url;
      else location.href = url;
    },
    (e) => {
      w?.close();
      onError(friendlyError(e));
    },
  );
}

function DocumentsTab({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { api, profile } = usePortal();
  const isAdmin = profile.role === 'admin';
  const cats = isAdmin ? DOC_CATEGORIES : DOC_CATEGORIES.filter((c) => STUDENT_UPLOAD_CATEGORIES.includes(c.value));
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocCategory>('invoice');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const label = new Map(DOC_CATEGORIES.map((c) => [c.value, c.label]));

  const upload = async () => {
    if (!file) return setError('Choose a file first.');
    if (!acceptsFile(file)) return setError('Please upload a photo or a PDF.');
    if (fileTooLarge(file)) return setError('That file is too large. A phone photo or a smaller PDF will work.');
    setBusy(true);
    setError('');
    try {
      await api.uploadDocument(data.student.id, file, category, title, isAdmin ? 'admin' : 'student');
      setFile(null);
      setTitle('');
      if (input.current) input.current.value = '';
      reload();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const groups = cats.map((c) => c.value).concat(DOC_CATEGORIES.map((c) => c.value).filter((v) => !cats.some((c) => c.value === v)));

  return (
    <>
      <Card title={isAdmin ? 'Add a document' : 'Send a document to the trustees'}>
        {!isAdmin && <p className="pmuted">Upload new invoices from your institution, semester results and receipts here. A clear phone photo is fine.</p>}
        <div className="pupload">
          <label className="pfile-pick">
            <span>{file ? file.name : 'Choose a photo or PDF'}</span>
            <span className="pill">{file ? 'Change' : 'Browse'}</span>
            <input ref={input} type="file" accept={ACCEPT_ATTR} className="sr-only"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
          </label>
          <select value={category} onChange={(e) => setCategory(e.target.value as DocCategory)} aria-label="What kind of document">
            {cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short description (optional), e.g. Year 2 Sem 1 invoice" aria-label="Description" />
          <Button variant="primary" onClick={upload} disabled={busy || !file}>{busy ? 'Uploading…' : 'Upload'}</Button>
        </div>
        {error && <p className="perror" role="alert">{error}</p>}
      </Card>

      <Card title="Documents on file">
        {data.documents.length ? (
          groups.filter((g) => data.documents.some((d) => d.category === g)).map((g) => (
            <div key={g} className="pdoc-group">
              <h3 className="psub">{label.get(g)}</h3>
              <ul className="pdocs">
                {data.documents.filter((d) => d.category === g).map((d) => (
                  <DocRow key={d.id} doc={d} canDelete={isAdmin} onChanged={reload} onError={setError} />
                ))}
              </ul>
            </div>
          ))
        ) : (
          <Empty>No documents yet.</Empty>
        )}
      </Card>
    </>
  );
}

function DocRow({ doc, canDelete, onChanged, onError }: { doc: DocumentRec; canDelete: boolean; onChanged: () => void; onError: (m: string) => void }) {
  const { api } = usePortal();
  const who = doc.uploaded_by_role === 'student' ? 'Uploaded by student' : doc.uploaded_by_role === 'applicant' ? 'From application' : 'Added by trustee';
  return (
    <li>
      <span className="pdoc-icon" aria-hidden="true">{doc.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>
      <span className="pdoc-main">
        <span className="t">{doc.title}</span>
        <span className="m">{who} · {fmtDate(doc.created_at)}{doc.size_bytes ? ` · ${fmtBytes(doc.size_bytes)}` : ''}</span>
      </span>
      <Button small onClick={() => openFile(api, doc.bucket, doc.path, onError)}>Open</Button>
      {canDelete && (
        <Button small variant="quiet" onClick={async () => {
          if (!confirm(`Delete “${doc.title}”? This can’t be undone.`)) return;
          try {
            await api.deleteDocument(doc);
            onChanged();
          } catch (e) {
            onError(friendlyError(e));
          }
        }}>Delete</Button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------

function NotesTab({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { api, profile, email } = usePortal();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Card title="Trustee notes" actions={<span className="pmuted small">Only trustees can see these</span>}>
      <form className="pnote-form" onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return;
        setBusy(true);
        setError('');
        try {
          await api.addNote(data.student.id, body.trim(), profile.full_name || email);
          setBody('');
          reload();
        } catch (err) {
          setError(friendlyError(err));
        } finally {
          setBusy(false);
        }
      }}>
        <label className="sr-only" htmlFor="note">New note</label>
        <textarea id="note" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Called her mother — invoice coming next week." />
        <Button type="submit" variant="primary" disabled={busy || !body.trim()}>{busy ? 'Saving…' : 'Add note'}</Button>
      </form>
      {error && <p className="perror" role="alert">{error}</p>}
      {data.notes.length ? (
        <ul className="pnotes">
          {data.notes.map((n) => (
            <li key={n.id}>
              <p>{n.body}</p>
              <span className="m">
                {n.author_name || 'Trustee'} · {fmtDate(n.created_at)}
                <button type="button" className="plink" onClick={async () => {
                  if (!confirm('Delete this note?')) return;
                  try {
                    await api.deleteNote(n.id);
                    reload();
                  } catch (err) {
                    setError(friendlyError(err));
                  }
                }}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No notes yet.</Empty>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------

function LoginTab({ data, reload }: { data: StudentBundle; reload: () => void }) {
  const { api } = usePortal();
  const s = data.student;
  const [code, setCode] = useState<string | null>(
    s.access_code && s.access_code_expires && new Date(s.access_code_expires) > new Date() ? s.access_code : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const portalUrl = `${location.origin}${location.pathname}#/portal`;
  const pretty = code ? `${code.slice(0, 4)}-${code.slice(4)}` : '';
  const message = code
    ? `Hi ${s.preferred_name || s.full_name.split(' ')[0]}, here's how to log in to your Jeevunjee scholarship file:\n\n1. Open ${portalUrl}\n2. Tap "First time here? Create your login"\n3. Enter your email, choose a password, and enter this access code: ${pretty}\n\nThe code works once and expires in 14 days. After that you can upload invoices and results and see your payment schedule.`
    : '';

  return (
    <Card title="Student login">
      {data.logins.length ? (
        <p>
          <Badge tone="paid">Has a login</Badge>{' '}
          {data.logins.map((l) => l.email).join(', ')} — they can sign in, see their payment schedule and upload documents.
        </p>
      ) : (
        <p className="pmuted">{s.full_name} doesn’t have a login yet.</p>
      )}

      {code ? (
        <div className="paccess">
          <span className="label">Access code</span>
          <span className="code">{pretty}</span>
          <span className="pmuted small">Valid until {fmtDate(s.access_code_expires ?? new Date(Date.now() + 14 * 86400000).toISOString())} · works once</span>
          <label className="sr-only" htmlFor="msg">Message to send</label>
          <textarea id="msg" readOnly rows={7} value={message} />
          <div className="prow-actions">
            <Button onClick={async () => {
              try {
                await navigator.clipboard.writeText(message);
                setCopied(true);
              } catch {
                /* clipboard blocked — the text is selectable */
              }
            }}>{copied ? 'Copied' : 'Copy message'}</Button>
            {(s.whatsapp || s.phone) && (
              <a className="pbtn ghost" target="_blank" rel="noopener noreferrer"
                href={`https://wa.me/${(s.whatsapp || s.phone || '').replace(/\D/g, '').replace(/^0/, '94')}?text=${encodeURIComponent(message)}`}>
                Send on WhatsApp
              </a>
            )}
          </div>
        </div>
      ) : null}

      <div className="prow-actions">
        <Button variant={code ? 'ghost' : 'primary'} disabled={busy} onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setCode(await api.issueAccessCode(s.id));
            setCopied(false);
            reload();
          } catch (e) {
            setError(friendlyError(e));
          } finally {
            setBusy(false);
          }
        }}>{busy ? 'Creating…' : code ? 'Make a new code' : data.logins.length ? 'Create a code for another login' : 'Create an access code'}</Button>
      </div>
      {error && <p className="perror" role="alert">{error}</p>}
    </Card>
  );
}
