import { useMemo, useState } from 'react';
import { dueState, fmtAmount, relativeDue } from '../format';
import { Avatar, Badge, Button, Empty, ErrorBox, Loading, StudentName, useAsync, usePortal } from '../ui';
import { StudentForm } from './forms';

export function StudentsPage() {
  const { api, navigate } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadOverview(), [api]);
  const [q, setQ] = useState('');
  const [trustId, setTrustId] = useState('');
  const [status, setStatus] = useState('active');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const trustName = new Map(data.trusts.map((t) => [t.id, t.name]));
    const needle = q.trim().toLowerCase();
    return data.students
      .map((s) => {
        const courses = data.courses.filter((c) => c.student_id === s.id);
        const current = courses.find((c) => c.status === 'ongoing') ?? courses[0];
        const due = data.instalments
          .filter((i) => i.student_id === s.id && i.status === 'due' && i.funded_by === 'trust')
          .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
        return { s, courses, current, next: due[0], trusts: [...new Set(courses.map((c) => c.trust_id && trustName.get(c.trust_id)).filter(Boolean))] as string[] };
      })
      .filter((r) => (!status || r.s.status === status))
      .filter((r) => !trustId || r.courses.some((c) => c.trust_id === trustId))
      .filter((r) =>
        !needle ||
        [r.s.full_name, r.s.preferred_name, r.s.code, r.s.phone, r.s.email, r.current?.title, r.current?.institution]
          .some((f) => f?.toLowerCase().includes(needle)),
      );
  }, [data, q, trustId, status]);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;

  return (
    <div className="ppage">
      <header className="ppage-head">
        <div>
          <h1>Students</h1>
          <p className="sub">{rows.length} shown · each student has a code (S-001…) so two people with the same name are never mixed up.</p>
        </div>
        <div className="ppage-tools">
          <Button variant="primary" onClick={() => setAdding(true)}>+ Add student</Button>
        </div>
      </header>

      <div className="pfilters">
        <input type="search" placeholder="Search name, code, phone, course…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
        <select value={trustId} onChange={(e) => setTrustId(e.target.value)} aria-label="Trust">
          <option value="">All trusts</option>
          {data.trusts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty>{data.students.length ? 'No students match those filters.' : 'No students yet. Add one, or enrol someone from Applications.'}</Empty>
      ) : (
        <ul className="pstudent-list">
          {rows.map(({ s, current, next, trusts }) => (
            <li key={s.id}>
              <a href={`#/portal/students/${s.id}`}>
                <Avatar student={s} size={48} />
                <span className="main">
                  <StudentName student={s} />
                  <span className="course">{current ? `${current.title}${current.institution ? ` · ${current.institution}` : ''}` : 'No course added yet'}</span>
                  <span className="tags">
                    {trusts.map((t) => <Badge key={t} tone="muted">{t}</Badge>)}
                    {s.status !== 'active' && <Badge>{s.status}</Badge>}
                  </span>
                </span>
                <span className="next">
                  {next ? (
                    <>
                      <span className="amt">{fmtAmount(next.amount_lkr, next.amount_foreign, next.foreign_currency)}</span>
                      <Badge tone={dueState(next) === 'overdue' ? 'overdue' : dueState(next) === 'soon' ? 'soon' : 'neutral'}>
                        {next.label} · {relativeDue(next.due_date)}
                      </Badge>
                    </>
                  ) : (
                    <Badge tone="paid">Nothing due</Badge>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <StudentForm
          onClose={() => setAdding(false)}
          onSaved={(st) => {
            setAdding(false);
            navigate(`/students/${st.id}`);
          }}
        />
      )}
    </div>
  );
}
