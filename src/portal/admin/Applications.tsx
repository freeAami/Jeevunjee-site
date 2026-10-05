import { useEffect, useState, type ReactNode } from 'react';
import { friendlyError } from '../api';
import { fmtDate, fmtForeign, fmtLkr } from '../format';
import type { Application, ApplicationStatus, Currency } from '../types';
import { Badge, Button, Card, Empty, ErrorBox, Loading, useAsync, useFileUrl, usePortal } from '../ui';
import { openFile } from './StudentFile';

const STATUS: { value: ApplicationStatus; label: string; tone: 'gold' | 'neutral' | 'soon' | 'paid' | 'muted' }[] = [
  { value: 'new', label: 'New', tone: 'gold' },
  { value: 'reviewing', label: 'Reading', tone: 'neutral' },
  { value: 'interview', label: 'Interview', tone: 'soon' },
  { value: 'accepted', label: 'Accepted', tone: 'paid' },
  { value: 'declined', label: 'Not this time', tone: 'muted' },
];
const statusOf = (s: ApplicationStatus) => STATUS.find((x) => x.value === s) ?? STATUS[0];

const num = (v: unknown) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const str = (v: unknown) => (v == null ? '' : String(v));

export function Applications() {
  const { api } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadApplications(), [api]);
  const [filter, setFilter] = useState<ApplicationStatus | ''>('');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;
  const rows = data.filter((a) => !filter || a.status === filter);

  return (
    <div className="ppage">
      <header className="ppage-head">
        <div>
          <h1>Applications</h1>
          <p className="sub">Everything sent through the website’s application journey.</p>
        </div>
        <div className="ppage-tools">
          <select value={filter} onChange={(e) => setFilter(e.target.value as ApplicationStatus | '')} aria-label="Status">
            <option value="">All</option>
            {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label} ({data.filter((a) => a.status === s.value).length})</option>)}
          </select>
        </div>
      </header>
      {rows.length ? (
        <div className="ptable-wrap">
          <table className="ptable">
            <thead><tr><th>Received</th><th>Name</th><th>Course</th><th className="num">Asking for</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const ans = a.answers;
                const st = statusOf(a.status);
                return (
                  <tr key={a.id} className="clickable" onClick={() => (location.hash = `#/portal/applications/${a.id}`)}>
                    <td>{fmtDate(a.created_at)}</td>
                    <td><a href={`#/portal/applications/${a.id}`}>{a.full_name}</a><small className="pnote">{a.reference}</small></td>
                    <td>{str(ans.courseTitle) || str(ans.course) || '—'}<small className="pnote">{str(ans.institution)}</small></td>
                    <td className="num">{requestedText(ans)}</td>
                    <td><Badge tone={st.tone}>{st.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{data.length ? 'No applications with that status.' : 'No applications yet. They appear here as soon as someone sends one from the website.'}</Empty>
      )}
    </div>
  );
}

function requestedText(ans: Record<string, unknown>) {
  const lkr = num(ans.totalFeeLkr) - num(ans.selfFinancedLkr);
  const f = num(ans.totalFeeForeign) - num(ans.selfFinancedForeign);
  const parts = [];
  if (lkr > 0) parts.push(fmtLkr(lkr));
  if (f > 0) parts.push(fmtForeign(f, (str(ans.foreignCurrency) || 'GBP') as Currency));
  return parts.join(' + ') || str(ans.amountNeeded) || '—';
}

export function ApplicationView({ id }: { id: string }) {
  const { api, navigate } = usePortal();
  const { data, error, loading, reload } = useAsync(async () => {
    const [apps, overview] = await Promise.all([api.loadApplications(), api.loadOverview()]);
    return { app: apps.find((a) => a.id === id), trusts: overview.trusts };
  }, [api, id]);
  const [notes, setNotes] = useState('');
  const [trustId, setTrustId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data?.app) setNotes(data.app.review_notes ?? '');
    if (data?.trusts.length) setTrustId((t) => t || data.trusts[0].id);
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;
  if (!data.app) return <ErrorBox message="That application wasn’t found." />;
  const a = data.app;
  const ans = a.answers;

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(done);
      reload();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ppage">
      <a className="pback" href="#/portal/applications">← All applications</a>
      <header className="pfile-head">
        <ApplicantPhoto app={a} />
        <div className="pfile-id">
          <h1>{a.full_name}</h1>
          <div className="pfile-meta">
            <span className="code">{a.reference}</span>
            <span>Received {fmtDate(a.created_at)}</span>
            <Badge tone={statusOf(a.status).tone}>{statusOf(a.status).label}</Badge>
          </div>
          <div className="pfile-contact">
            {a.phone && <a href={`tel:${a.phone}`}>{a.phone}</a>}
            {a.email && <a href={`mailto:${a.email}`}>{a.email}</a>}
            {str(ans.city) && <span>{str(ans.city)}</span>}
          </div>
        </div>
      </header>

      <Card title="Decision" className="pdecision">
        <div className="pdecision-row">
          <label htmlFor="ap-status">Status</label>
          <select id="ap-status" value={a.status} disabled={busy || !!a.student_id}
            onChange={(e) => act(() => api.updateApplication(a.id, { status: e.target.value as ApplicationStatus }), 'Status updated.')}>
            {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <label className="sr-only" htmlFor="ap-notes">Review notes</label>
        <textarea id="ap-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Review notes — only trustees see these" />
        <div className="prow-actions">
          <Button disabled={busy || notes === (a.review_notes ?? '')} onClick={() => act(() => api.updateApplication(a.id, { review_notes: notes }), 'Notes saved.')}>Save notes</Button>
        </div>
        <hr />
        {a.student_id ? (
          <p>Enrolled — <a href={`#/portal/students/${a.student_id}`}>open their student file →</a></p>
        ) : (
          <div className="penrol">
            <p>Accepting them creates a student file with their details, course, payment plan and documents already filled in.</p>
            <div className="pdecision-row">
              <label htmlFor="ap-trust">Funded by</label>
              <select id="ap-trust" value={trustId} onChange={(e) => setTrustId(e.target.value)}>
                {data.trusts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <Button variant="primary" disabled={busy || !trustId} onClick={async () => {
                if (!confirm(`Accept ${a.full_name} and create their student file?`)) return;
                setBusy(true);
                setErr('');
                try {
                  const sid = await api.enrolApplication(a.id, trustId);
                  navigate(`/students/${sid}`);
                } catch (e) {
                  setErr(friendlyError(e));
                  setBusy(false);
                }
              }}>Accept &amp; create student file</Button>
            </div>
          </div>
        )}
        {msg && <p className="pinfo" role="status">{msg}</p>}
        {err && <p className="perror" role="alert">{err}</p>}
      </Card>

      <ApplicationAnswers app={a} onError={setErr} />
    </div>
  );
}

function ApplicantPhoto({ app }: { app: Application }) {
  const photo = app.files.find((f) => f.field === 'photo');
  const url = useFileUrl(photo ? 'applications' : null, photo?.path ?? null);
  return (
    <div className="pfile-photo">
      <span className="pavatar" style={{ width: 88, height: 88, fontSize: 32 }} aria-hidden="true">
        {url ? <img src={url} alt="" /> : app.full_name.slice(0, 1)}
      </span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function ApplicationAnswers({ app, onError }: { app: Application; onError: (m: string) => void }) {
  const { api } = usePortal();
  const ans = app.answers;
  const cur = (str(ans.foreignCurrency) || 'GBP') as Currency;
  const money = (lkr: unknown, f: unknown) => {
    const parts = [];
    if (num(lkr)) parts.push(fmtLkr(num(lkr)));
    if (num(f)) parts.push(fmtForeign(num(f), cur));
    return parts.join(' + ');
  };
  const fileFor = (field: string) => app.files.filter((f) => f.field === field);
  const FileLinks = ({ field }: { field: string }) => (
    <>
      {fileFor(field).map((f) => (
        <button key={f.path} type="button" className="plink" onClick={() => openFile(api, 'applications', f.path, onError)}>
          {f.label || f.name} ↗
        </button>
      ))}
    </>
  );
  const education = (Array.isArray(ans.education) ? ans.education : []) as Record<string, string>[];
  const plan = (Array.isArray(ans.plan) ? ans.plan : []) as Record<string, string>[];
  const known = new Set(['fullName', 'dateOfBirth', 'phone', 'email', 'city', 'school', 'education', 'achievements', 'hasWork', 'workCompany', 'workRole', 'workSkills',
    'ambition', 'goals', 'courseTitle', 'institution', 'awardingBody', 'durationYears', 'paymentFrequency', 'startMonth', 'totalFeeLkr', 'totalFeeForeign',
    'foreignCurrency', 'selfFinancedLkr', 'selfFinancedForeign', 'assistanceKind', 'plan', 'familySituation', 'signatureName', 'signedOn',
    'declTruthful', 'declWilling', 'declInterview', 'declPrivacy']);
  const extra = Object.entries(ans).filter(([k, v]) => !known.has(k) && v !== '' && v != null && typeof v !== 'object');

  return (
    <>
      <Card title="About them">
        <dl className="pdetails-list">
          <Row label="Date of birth">{str(ans.dateOfBirth) && fmtDate(str(ans.dateOfBirth))}</Row>
          <Row label="Phone / WhatsApp">{str(ans.phone)}</Row>
          <Row label="Email">{str(ans.email)}</Row>
          <Row label="City / district">{str(ans.city)}</Row>
          <Row label="ID document"><FileLinks field="idFile" /></Row>
        </dl>
      </Card>

      <Card title="Education & experience">
        <dl className="pdetails-list">
          <Row label="School (alma mater)">{str(ans.school)}</Row>
        </dl>
        {education.length > 0 && (
          <div className="ptable-wrap">
            <table className="ptable">
              <thead><tr><th>Qualification</th><th>Year</th><th>Results</th><th>Certificate</th></tr></thead>
              <tbody>
                {education.map((e) => (
                  <tr key={e.id}>
                    <td>{e.level}</td><td>{e.year}</td><td className="pre">{e.results}</td>
                    <td><FileLinks field={`edu:${e.id}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="pdetails-list">
          <Row label="Co-curricular achievements"><span className="pre">{str(ans.achievements)}</span></Row>
          <Row label="Work experience">
            {ans.hasWork ? <span className="pre">{[str(ans.workRole), str(ans.workCompany)].filter(Boolean).join(' at ')}{str(ans.workSkills) && `\nSkills: ${str(ans.workSkills)}`}</span> : 'None'}
          </Row>
        </dl>
      </Card>

      <Card title="Plans">
        <dl className="pdetails-list">
          <Row label="Ambition"><span className="pre">{str(ans.ambition)}</span></Row>
          <Row label="5–10 year goals"><span className="pre">{str(ans.goals)}</span></Row>
        </dl>
      </Card>

      <Card title="Programme & finances">
        <dl className="pdetails-list">
          <Row label="Course">{str(ans.courseTitle)}</Row>
          <Row label="Where">{[str(ans.institution), str(ans.awardingBody)].filter(Boolean).join(' · ')}</Row>
          <Row label="Length">{str(ans.durationYears) && `${str(ans.durationYears)} year(s)`}</Row>
          <Row label="Billing">{str(ans.paymentFrequency)}</Row>
          <Row label="Starts">{str(ans.startMonth)}</Row>
          <Row label="Course details / fee schedule"><FileLinks field="feeSchedule" /></Row>
          <Row label="Total course fee">{money(ans.totalFeeLkr, ans.totalFeeForeign)}</Row>
          <Row label="Family will cover">{money(ans.selfFinancedLkr, ans.selfFinancedForeign)}</Row>
          <Row label="Asking the trust for"><strong>{requestedText(ans)}</strong></Row>
          <Row label="As a">{str(ans.assistanceKind)}</Row>
        </dl>
        {plan.length > 0 && (
          <div className="ptable-wrap">
            <table className="ptable">
              <thead><tr><th>Payment</th><th>When</th><th className="num">Amount</th><th>Who pays</th></tr></thead>
              <tbody>
                {plan.map((p) => (
                  <tr key={p.id}>
                    <td>{p.label}</td><td>{p.when || '—'}</td><td className="num">{money(p.amountLkr, p.amountForeign) || '—'}</td>
                    <td>{p.payer === 'self' ? 'Family' : 'Trust'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Family situation">
        <p className="pre">{str(ans.familySituation) || '—'}</p>
        <dl className="pdetails-list"><Row label="Income proof"><FileLinks field="incomeProof" /></Row></dl>
      </Card>

      <Card title="Declaration">
        <p>Signed “{str(ans.signatureName)}”{str(ans.signedOn) && ` on ${fmtDate(str(ans.signedOn))}`}, confirming the answers are true, given willingly, and agreeing to a possible interview.</p>
      </Card>

      {extra.length > 0 && (
        <Card title="Other answers">
          <dl className="pdetails-list">{extra.map(([k, v]) => <Row key={k} label={k}>{String(v)}</Row>)}</dl>
        </Card>
      )}
    </>
  );
}
