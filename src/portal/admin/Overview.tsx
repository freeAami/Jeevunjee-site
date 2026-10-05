import { useMemo, useState } from 'react';
import { daysFromToday, dueState, fmtAmount, fmtDate, fmtLkr, fmtMixed, relativeDue, sumMixed, today } from '../format';
import type { Instalment, Overview, Student } from '../types';
import { Avatar, Badge, Card, Empty, ErrorBox, Loading, StudentName, useAsync, usePortal } from '../ui';

export function OverviewPage() {
  const { api } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadOverview(), [api]);
  const [trustId, setTrustId] = useState('');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;
  return <OverviewBody data={data} trustId={trustId} setTrustId={setTrustId} />;
}

function OverviewBody({ data, trustId, setTrustId }: { data: Overview; trustId: string; setTrustId: (v: string) => void }) {
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
              ? `+ ${fmtMixed(v.unconverted)} without a recorded rate`
              : 'Rupee cost to the trust, at the rates on the day'}
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
                <tr><th>Date</th><th>Student</th><th>Amount</th><th className="num">Cost in rupees</th><th>Paid to</th></tr>
              </thead>
              <tbody>
                {v.recent.map((p) => {
                  const s = v.student.get(p.student_id);
                  return (
                    <tr key={p.id}>
                      <td>{fmtDate(p.paid_on)}</td>
                      <td>{s ? <a href={`#/portal/students/${s.id}`}><StudentName student={s} /></a> : '—'}</td>
                      <td>{fmtAmount(p.amount_lkr, p.amount_foreign, p.foreign_currency)}</td>
                      <td className="num">{p.amount_foreign && !p.fx_rate ? <Badge tone="soon">No rate</Badge> : fmtLkr(p.total_lkr)}</td>
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
                {fmtAmount(i.amount_lkr, i.amount_foreign, i.foreign_currency)}
                <Badge tone={state === 'overdue' ? 'overdue' : state === 'soon' ? 'soon' : 'neutral'}>{relativeDue(i.due_date)}</Badge>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
