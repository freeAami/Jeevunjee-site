import { useState } from 'react';
import { friendlyError } from '../api';
import { fmtDate } from '../format';
import type { TrusteeInvite } from '../types';
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, useAsync, usePortal } from '../ui';

const pretty = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

function inviteState(i: TrusteeInvite) {
  if (i.used_at) return 'used';
  return new Date(i.expires_at) > new Date() ? 'open' : 'expired';
}

export function TrusteesPage() {
  const { api, profile } = usePortal();
  const { data, error, loading, reload } = useAsync(() => api.loadTrustees(), [api]);
  const [label, setLabel] = useState('');
  const [made, setMade] = useState<{ code: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox message={error ?? 'Could not load'} onRetry={reload} />;

  const portalUrl = `${location.origin}${location.pathname}#/portal`;
  const message = made
    ? `Salaam ${made.label.replace(/^for\s+/i, '')}, you've been invited to the Jeevunjee trustee portal.\n\n1. Open ${portalUrl}\n2. Tap "I have a trustee code"\n3. Enter this code: ${pretty(made.code)}\n4. Enter your name and email and choose a password.\n\nThe code works once and expires in 7 days. After that you sign in with your email and password.`
    : '';

  const create = async () => {
    if (!label.trim()) return setErr('Say who the code is for, e.g. “Imran”.');
    setBusy(true);
    setErr('');
    try {
      const code = await api.createTrusteeInvite(label.trim());
      setMade({ code, label: label.trim() });
      setLabel('');
      setCopied(false);
      reload();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const open = data.invites.filter((i) => inviteState(i) === 'open');
  const past = data.invites.filter((i) => inviteState(i) !== 'open');

  return (
    <div className="ppage">
      <header className="ppage-head">
        <div>
          <h1>Trustees</h1>
          <p className="sub">Everyone here can see and manage every student in both trusts.</p>
        </div>
      </header>

      <Card title="Invite a trustee">
        <p className="pmuted">
          Make a one-time code and send it privately. The person opens the portal, taps “I have a trustee code”, and links
          their own email and password. The code works once and expires after 7 days.
        </p>
        <div className="pinvite-form">
          <Field label="Who is it for?" hint="Only trustees see this, to keep track of codes.">
            {(id) => <input id={id} value={label} maxLength={100} placeholder="e.g. Imran" onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />}
          </Field>
          <Button variant="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create trustee code'}</Button>
        </div>
        {err && <p className="perror" role="alert">{err}</p>}
        {made && (
          <div className="paccess">
            <span className="label">Trustee code for {made.label}</span>
            <span className="code">{pretty(made.code)}</span>
            <span className="pmuted small">Works once · expires {fmtDate(new Date(Date.now() + 7 * 86400000).toISOString())}</span>
            <label className="sr-only" htmlFor="tmsg">Message to send</label>
            <textarea id="tmsg" readOnly rows={8} value={message} />
            <div className="prow-actions">
              <Button onClick={async () => {
                try {
                  await navigator.clipboard.writeText(message);
                  setCopied(true);
                } catch {
                  /* clipboard blocked — the text is selectable */
                }
              }}>{copied ? 'Copied' : 'Copy message'}</Button>
              <a className="pbtn ghost" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>
                Send on WhatsApp
              </a>
            </div>
          </div>
        )}
      </Card>

      <Card title={`Trustees with a login (${data.trustees.length})`}>
        {data.trustees.length ? (
          <ul className="ptrustees">
            {data.trustees.map((t) => (
              <li key={t.id}>
                <span className="main">
                  <strong>{t.full_name || t.email}</strong>
                  {t.full_name && <span className="pmuted small">{t.email}</span>}
                </span>
                {t.id === profile.id && <Badge tone="muted">You</Badge>}
                {t.created_at && <span className="pmuted small">Joined {fmtDate(t.created_at)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No trustees yet.</Empty>
        )}
      </Card>

      <Card title="Codes">
        {data.invites.length === 0 ? (
          <Empty>No trustee codes made yet.</Empty>
        ) : (
          <ul className="ptrustees">
            {[...open, ...past].map((i) => {
              const st = inviteState(i);
              return (
                <li key={i.id}>
                  <span className="main">
                    <strong>{i.label}</strong>
                    <span className="pmuted small">
                      {st === 'used'
                        ? `Used by ${i.used_email} on ${fmtDate(i.used_at)}`
                        : st === 'open'
                          ? `${pretty(i.code)} · expires ${fmtDate(i.expires_at)}`
                          : `Expired ${fmtDate(i.expires_at)}`}
                    </span>
                  </span>
                  <Badge tone={st === 'used' ? 'paid' : st === 'open' ? 'soon' : 'muted'}>{st === 'used' ? 'Used' : st === 'open' ? 'Waiting' : 'Expired'}</Badge>
                  {st !== 'used' && (
                    <Button small variant="quiet" onClick={async () => {
                      if (st === 'open' && !confirm(`Cancel the code for ${i.label}? It will stop working straight away.`)) return;
                      try {
                        await api.cancelTrusteeInvite(i.id);
                      } catch (e) {
                        alert(friendlyError(e));
                      }
                      reload();
                    }}>{st === 'open' ? 'Cancel code' : 'Remove'}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="pmuted small">
          To take away someone’s trustee access, delete their login in Supabase → Authentication → Users.
        </p>
      </Card>
    </div>
  );
}
