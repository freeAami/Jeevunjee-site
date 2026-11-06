import { useMemo, useState } from 'react';
import { friendlyError } from '../api';
import { daysFromToday, dueState, fmtAmount, fmtDate, fmtForeign, fmtLkr, fmtMixed, relativeDue, sumMixed, today } from '../format';
import type { Currency, Instalment, Overview, Student } from '../types';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Loading, MoneyInput, StudentName, useAsync, usePortal } from '../ui';

export function OverviewPage() {
  const { api } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadOverview(), [api]);
  const [trustId, setTrustId] = useState('');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;
  return <OverviewBody data={data} trustId={trustId} setTrustId={setTrustId} reload={reload} />;
}

/** Records from before the portal went rupees-only, per currency, that still need a rate. */
function legacyForeign(data: Overview) {
  const per = new Map<Currency, { amount: number; rows: number }>();
  const add = (amount: number, c: Currency | null) => {
    if (!amount) return;
    const k = c ?? 'GBP';
    const cur = per.get(k) ?? { amount: 0, rows: 0 };
    per.set(k, { amount: cur.amount + amount, rows: cur.rows + 1 });
  };
  data.courses.forEach((c) => add(c.total_fee_foreign, c.foreign_currency));
  data.instalments.forEach((i) => add(i.amount_foreign, i.foreign_currency));
  data.payments.filter((p) => !p.fx_rate).forEach((p) => add(p.amount_foreign, p.foreign_currency));
  const rated = data.payments.filter((p) => p.amount_foreign && p.fx_rate).length;
  return { per, rated };
}

function ConvertCard({ data, onDone }: { data: Overview; onDone: () => void }) {
  const { api } = usePortal();
  const { per, rated } = legacyForeign(data);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!per.size && !rated) return null;
  const ready = [...per.keys()].every((c) => (rates[c] ?? 0) > 0);
  return (
    <Card title="Convert old amounts to rupees">
      <p className="pmuted">
        The portal now uses rupees only. Some records from before still have a part in another currency. Enter today’s
        rate once and they’ll all be folded into rupees. Each record keeps a note of what it was.
        {rated ? ` ${rated} payment${rated === 1 ? '' : 's'} already ha${rated === 1 ? 's its' : 've their'} own rate and will use it.` : ''}
      </p>
      <div className="pconvert">
        {[...per].map(([c, v]) => (
          <label key={c} className="pfield">
            <span className="label">{fmtForeign(v.amount, c)} across {v.rows} record{v.rows === 1 ? '' : 's'} · rupees per 1 {c}</span>
            <MoneyInput id={`rate-${c}`} value={rates[c] ?? null} onChange={(x) => setRates((r) => ({ ...r, [c]: x }))} placeholder="e.g. 390" />
          </label>
        ))}
      </div>
      <Button variant="primary" disabled={busy || !ready} onClick={async () => {
        if (!confirm('Convert these amounts to rupees? This can’t be undone, but each record keeps a note of the old amount.')) return;
        setBusy(true);
        setError('');
        try {
          await api.convertToRupees(Object.fromEntries([...per.keys()].map((c) => [c, rates[c]])));
          onDone();
        } catch (e) {
          setError(friendlyError(e));
        } finally {
          setBusy(false);
        }
      }}>{busy ? 'Converting…' : 'Convert to rupees'}</Button>
      {error && <p className="perror" role="alert">{error}</p>}
    </Card>
  );
}

function OverviewBody({ data, trustId, setTrustId, reload }: { data: Overview; trustId: string; setTrustId: (v: string) => void; reload: () => void }) {
  const v = useMemo(() => {
    const courseTrust = new Map(data.courses.map((c) => [c.id, c.trust_id]));
    const student = new Map(data.students.map((s) => [s.id, s]));
    const inTrust = (tid: string | null | undefined) => !trustId || tid === trustId;

    const activeStudents = data.students.filter(
      (s) => s.status === 'active' && data.courses.some((c) => c.student_id === s.id && inTrust(c.trust_id)),
    );
    const perTrust = data.trusts.map((t) => ({
      trust: t,
      count: data.students.filter(
        (s) => s.status === 'active' && data.courses.some((c) => c.student_id === s.id && c.trust_id === t.id && c.status === 'ongoing'),
      ).length,
    }));

    const year = today().slice(0, 4);
    const paidThisYear = data.payments.filter((p) => p.paid_on.startsWith(year) && p.trust_id && inTrust(p.trust_id));
    const paidLkr = paidThisYear.reduce((n, p) => n + Number(p.total_lkr || 0), 0);
    const unconverted = sumMixed(
      paidThisYear.filter((p) => p.amount_foreign && !p.fx_rate).map((p) => ({ lkr: 0, foreign: p.amount_foreign, currency: p.foreign_currency })),
    );

    const due = data.instalments.filter(
      (i) => i.status === 'due' && i.funded_by === 'trust' && inTrust(courseTrust.get(i.course_id)) && student.get(i.student_id)?.status !== 'withdrawn',
    );
    const outstanding = sumMixed(due.map((i) => ({ lkr: i.amount_lkr, foreign: i.amount_foreign, currency: i.foreign_currency })));
    const overdue = due.filter((i) => dueState(i) === 'overdue');
    const upcoming = due.filter((i) => i.due_date && daysFromToday(i.due_date) >= 0 && daysFromToday(i.due_date) <= 60);
    const unscheduled = due.filter((i) => !i.due_date);
    const recent = data.payments.filter((p) => inTrust(p.trust_id)).slice(0, 6);
    const newApps = data.applications.filter((a) => a.status === 'new').length;

    return { student, activeStudents, perTrust, paidLkr, unconverted, outstanding, overdue, upcoming, unscheduled, recent, newApps, year };
  }, [data, trustId]);

  return (
    <div className="ppage">
      <header className="ppage-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="ppage-tools">
          <label className="sr-only" htmlFor="ov-trust">Trust</label>
          <select id="ov-trust" value={trustId} onChange={(e) => setTrustId(e.target.value)}>
            <option value="">All trusts</option>
            {data.trusts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </header>

      <div className="pstats">
        <div className="pstat">
          <span className="label">Active students</span>
          <span className="value">{v.activeStudents.length}</span>
          <span className="foot">{v.perTrust.map((p) => `${p.trust.name.replace(' Trust', '')}: ${p.count}`).join(' · ')}</span>
        </div>
        <div className="pstat">
          <span className="label">Paid in {v.year}</span>
          <span className="value">{fmtLkr(v.paidLkr)}</span>
          <span className="foot">
            {v.unconverted.foreign.size
              ? `+ ${fmtMixed(v.unconverted)} still to convert`
              : 'Paid by the trusts this year'}
          </span>
        </div>
        <div className="pstat">
          <span className="label">Still to pay</span>
          <span className="value small">{fmtMixed(v.outstanding)}</span>
          <span className="foot">All upcoming trust-funded instalments</span>
        </div>
        <a className={`pstat link${v.overdue.length ? ' alert' : ''}`} href="#/portal/students">
          <span className="label">Overdue</span>
          <span className="value">{v.overdue.length}</span>
          <span className="foot">{v.overdue.length ? 'Needs attention' : 'Nothing overdue'}</span>
        </a>
        <a className={`pstat link${v.newApps ? ' gold' : ''}`} href="#/portal/applications">
          <span className="label">New applications</span>
          <span className="value">{v.newApps}</span>
          <span className="foot">{v.newApps ? 'Waiting to be read' : 'All read'}</span>
        </a>
      </div>

      <ConvertCard data={data} onDone={reload} />

      <div className="pgrid-2">
        <Card title="Needs attention">
          {v.overdue.length || v.unscheduled.length ? (
            <DueList items={[...v.overdue, ...v.unscheduled]} student={v.student} />
          ) : (
            <Empty>Nothing overdue, and every instalment has a date.</Empty>
          )}
        </Card>
        <Card title="Coming up · next 60 days">
          {v.upcoming.length ? <DueList items={v.upcoming} student={v.student} /> : <Empty>Nothing due in the next two months.</Empty>}
        </Card>
      </div>

      <Card title="Recent payments">
        {v.recent.length ? (
          <div className="ptable-wrap">
            <table className="ptable">
              <thead>
                <tr><th>Date</th><th>Student</th><th className="num">Amount</th><th>Paid to</th></tr>
              </thead>
              <tbody>
                {v.recent.map((p) => {
                  const s = v.student.get(p.student_id);
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paid_on)}</td>
                      <td>{s ? <a href={`#/portal/students/${s.id}`}><StudentName student={s} /></a> : '—'}</td>
                      <td className="num">{p.amount_foreign && !p.fx_rate ? fmtAmount(p.amount_lkr, p.amount_foreign, p.foreign_currency) : fmtLkr(p.total_lkr)}</td>
                      <td>{p.paid_to || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No payments recorded yet.</Empty>
        )}
      </Card>
    </div>
  );
}

function DueList({ items, student }: { items: Instalment[]; student: Map<string, Student> }) {
  return (
    <ul className="pduelist">
      {items.map((i) => {
        const s = student.get(i.student_id);
        const state = dueState(i);
        return (
          <li key={i.id}>
            <a href={`#/portal/students/${i.student_id}?tab=payments`}>
              {s && <Avatar student={s} size={36} />}
              <span className="pwho">
                {s ? <StudentName student={s} /> : 'Unknown student'}
                <span className="what">{i.label}</span>
              </span>
              <span className="amt">
                {i.amount_foreign ? fmtAmount(i.amount_lkr, i.amount_foreign, i.foreign_currency) : fmtLkr(i.amount_lkr)}
                <Badge tone={state === 'overdue' ? 'overdue' : state === 'soon' ? 'soon' : 'neutral'}>{relativeDue(i.due_date)}</Badge>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
