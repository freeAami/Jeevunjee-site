import { useMemo, useState } from 'react';
import { fmtDate, fmtLkr } from '../format';
import { PROOF_STEPS, type DocCategory } from '../types';
import { Badge, Button, Card, Empty, ErrorBox, Loading, useAsync, usePortal } from '../ui';
import { openFile } from './StudentFile';

const stepLabel = new Map(PROOF_STEPS.map((s) => [s.value, s.label]));

/** Every invoice, cheque and receipt photo from every student, newest first, plus paid payments still missing a receipt. */
export function ReceiptsPage() {
  const { api } = usePortal();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([api.loadOverview(), api.loadPaymentProof()]).then(([overview, docs]) => ({ overview, docs })),
    [api],
  );
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'' | DocCategory>('');
  const [month, setMonth] = useState('');
  const [openErr, setOpenErr] = useState('');

  const view = useMemo(() => {
    if (!data) return null;
    const students = new Map(data.overview.students.map((s) => [s.id, s]));
    const instalments = new Map(data.overview.instalments.map((i) => [i.id, i]));
    const needle = q.trim().toLowerCase();
    const docs = data.docs
      .filter((d) => !kind || d.category === kind)
      .filter((d) => !month || d.created_at.startsWith(month))
      .map((d) => ({ d, s: students.get(d.student_id), i: d.instalment_id ? instalments.get(d.instalment_id) : undefined }))
      .filter(({ d, s, i }) => !needle || [s?.full_name, s?.preferred_name, s?.code, i?.label, d.title].some((f) => f?.toLowerCase().includes(needle)));
    const withReceipt = new Set(data.docs.filter((d) => d.category === 'receipt' && d.instalment_id).map((d) => d.instalment_id));
    const missing = data.overview.instalments
      .filter((i) => i.status === 'paid' && i.funded_by === 'trust' && !withReceipt.has(i.id))
      .map((i) => ({ i, s: students.get(i.student_id) }))
      .sort((a, b) => (b.i.due_date ?? '').localeCompare(a.i.due_date ?? ''));
    return { docs, missing };
  }, [data, q, kind, month]);

  if (loading && !data) return <Loading />;
  if (error || !data || !view) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;

  return (
    <div className="ppage">
      <header className="ppage-head">
        <div>
          <h1>Receipts</h1>
          <p className="sub">Every invoice, cheque and receipt photo from every student. Each one also sits with its payment in the student’s file.</p>
        </div>
      </header>

      <div className="pfilters">
        <input type="search" placeholder="Search student, code or payment…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search receipts" />
        <select value={kind} onChange={(e) => setKind(e.target.value as '' | DocCategory)} aria-label="Type">
          <option value="">Invoices, cheques and receipts</option>
          {PROOF_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month added" />
      </div>
      {openErr && <p className="perror" role="alert">{openErr}</p>}

      <Card title={`Photos (${view.docs.length})`}>
        {view.docs.length === 0 ? (
          <Empty>{data.docs.length ? 'Nothing matches those filters.' : 'No invoice, cheque or receipt photos yet.'}</Empty>
        ) : (
          <ul className="ptrustees">
            {view.docs.map(({ d, s, i }) => (
              <li key={d.id}>
                <span className="main">
                  <strong>{s ? <a href={`#/portal/students/${s.id}`}>{s.full_name} · {s.code}</a> : 'Unknown student'}</strong>
                  <span className="pmuted small">
                    {[i ? `${i.label}${i.due_date ? ` (due ${fmtDate(i.due_date)})` : ''}` : 'Not linked to a payment', d.title, `added ${fmtDate(d.created_at)}`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Badge tone={d.category === 'receipt' ? 'paid' : d.category === 'cheque' ? 'gold' : 'neutral'}>{stepLabel.get(d.category) ?? d.category}</Badge>
                <Button small onClick={() => { setOpenErr(''); openFile(api, d.bucket, d.path, setOpenErr); }}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Paid by the trust, no receipt yet (${view.missing.length})`}>
        {view.missing.length === 0 ? (
          <Empty>Every payment the trust has made has a receipt.</Empty>
        ) : (
          <ul className="ptrustees">
            {view.missing.map(({ i, s }) => (
              <li key={i.id}>
                <span className="main">
                  <strong>{s ? <a href={`#/portal/students/${s.id}`}>{s.full_name} · {s.code}</a> : 'Unknown student'}</strong>
                  <span className="pmuted small">{i.label}{i.due_date ? ` · due ${fmtDate(i.due_date)}` : ''} · {fmtLkr(i.amount_lkr)}</span>
                </span>
                <Badge tone="soon">Ask for the receipt</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
