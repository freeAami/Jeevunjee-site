import { useState, type FormEvent } from 'react';
import { friendlyError, type PortalApi } from './api';

type Mode = 'signin' | 'create' | 'forgot';

export function Login({ api, signedInWithoutProfile, startupError }: { api: PortalApi; signedInWithoutProfile: boolean; startupError?: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(startupError ?? '');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'create') {
      if (password.length < 8) return setError('Please choose a password of at least 8 characters.');
      if (password !== confirm) return setError('The two passwords don’t match.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') await api.signIn(email, password);
      else if (mode === 'create') await api.signUp(email, password, code);
      else {
        await api.sendPasswordReset(email);
        setInfo('If that email has an account, a link to choose a new password is on its way. Check spam too.');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  if (api.mode === 'demo') {
    return (
      <div className="plogin">
        <div className="plogin-card">
          <h1>Trustee portal</h1>
          <p className="lede">Try the portal with fictional sample data before it’s connected.</p>
          <div className="plogin-demo">
            <button type="button" className="pbtn primary" onClick={() => api.signIn('trustee@preview', '')}>Preview as a trustee</button>
            <button type="button" className="pbtn ghost" onClick={() => api.signIn('student@preview', '')}>Preview as a student</button>
          </div>
          <a className="plogin-back" href="#top">← Back to the public site</a>
        </div>
      </div>
    );
  }

  return (
    <div className="plogin">
      <form className="plogin-card" onSubmit={submit} noValidate>
        <h1>{mode === 'create' ? 'Create your login' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}</h1>
        <p className="lede">
          {mode === 'create'
            ? 'Students: use the access code a trustee gave you. Trustees: leave the code empty — your email is already registered.'
            : mode === 'forgot'
              ? 'We’ll email you a link to choose a new password.'
              : 'For the Trust’s trustees and the students it supports.'}
        </p>

        {signedInWithoutProfile && (
          <p className="perror" role="alert">This login isn’t linked to the Trust yet. Ask a trustee to check your access.</p>
        )}

        <div className="pfield">
          <label htmlFor="l-email">Email</label>
          <input id="l-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== 'forgot' && (
          <div className="pfield">
            <label htmlFor="l-pw">{mode === 'create' ? 'Choose a password' : 'Password'}</label>
            <input id="l-pw" type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {mode === 'create' && (
          <>
            <div className="pfield">
              <label htmlFor="l-pw2">Type the password again</label>
              <input id="l-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="pfield">
              <label htmlFor="l-code">Access code <span className="opt">· students only</span></label>
              <input id="l-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off"
                autoCapitalize="characters" spellCheck={false} placeholder="e.g. K7QM-2XPA" />
            </div>
          </>
        )}

        {error && <p className="perror" role="alert">{error}</p>}
        {info && <p className="pinfo" role="status">{info}</p>}

        <button type="submit" className="pbtn primary block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'create' ? 'Create login' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>

        <div className="plogin-links">
          {mode !== 'signin' && <button type="button" onClick={() => { setMode('signin'); setError(''); }}>Back to sign in</button>}
          {mode === 'signin' && <button type="button" onClick={() => { setMode('create'); setError(''); }}>First time here? Create your login</button>}
          {mode === 'signin' && <button type="button" onClick={() => { setMode('forgot'); setError(''); }}>Forgot password?</button>}
        </div>
        <a className="plogin-back" href="#top">← Back to the public site</a>
      </form>
    </div>
  );
}

export function SetNewPassword({ api, onDone }: { api: PortalApi; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="plogin">
      <form
        className="plogin-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return setError('Please choose a password of at least 8 characters.');
          setBusy(true);
          try {
            await api.updatePassword(pw);
            onDone();
          } catch (err) {
            setError(friendlyError(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Choose a new password</h1>
        <div className="pfield">
          <label htmlFor="np">New password</label>
          <input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        {error && <p className="perror" role="alert">{error}</p>}
        <button type="submit" className="pbtn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </div>
  );
}
