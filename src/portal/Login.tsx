import { useState, type FormEvent } from 'react';
import { friendlyError, type PortalApi } from './api';

type Mode = 'signin' | 'create' | 'forgot' | 'trustee';

export function Login({ api, signedInWithoutProfile, startupError }: { api: PortalApi; signedInWithoutProfile: boolean; startupError?: string }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [codeOk, setCodeOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(startupError ?? '');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'trustee' && !codeOk) {
      if (!code.trim()) return setError('Enter the trustee code you were sent.');
      setBusy(true);
      try {
        if (await api.checkTrusteeCode(code)) setCodeOk(true);
        else setError('That code doesn’t work. It may have expired or already been used. Ask a trustee for a new one.');
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode === 'create' || mode === 'trustee') {
      if (mode === 'trustee' && !name.trim()) return setError('Please enter your name.');
      if (password.length < 8) return setError('Please choose a password of at least 8 characters.');
      if (password !== confirm) return setError('The two passwords don’t match.');
    }
    setBusy(true);
    try {
      if (mode === 'signin') await api.signIn(email, password);
      else if (mode === 'create' || mode === 'trustee') {
        const result = await api.signUp(email, password, code, mode === 'trustee' ? name : undefined);
        if (result === 'check-email') {
          setMode('signin');
          setCodeOk(false);
          setPassword('');
          setConfirm('');
          setInfo(`Your login is made. We’ve emailed a confirmation link to ${email.trim()}. Open it (check spam too), then sign in here.`);
        }
      } else {
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

  const trustee = mode === 'trustee';
  const creating = mode === 'create' || (trustee && codeOk);
  const go = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
    setCodeOk(false);
  };

  return (
    <div className="plogin">
      <form className="plogin-card" onSubmit={submit} noValidate>
        {trustee && <p className="plogin-step">Trustee sign-up · step {codeOk ? 2 : 1} of 2</p>}
        <h1>
          {trustee ? (codeOk ? 'Link your email' : 'Enter your trustee code')
            : mode === 'create' ? 'Create your login' : mode === 'forgot' ? 'Reset your password' : 'Sign in'}
        </h1>
        <p className="lede">
          {trustee
            ? codeOk
              ? 'The code works. Enter the email you’ll sign in with and choose a password. You only do this once.'
              : 'Enter the one-time code a trustee sent you. It looks like ABCDE-FGH23.'
            : mode === 'create'
              ? 'Students: use the one-time access code a trustee sent you. Trustees: go back and choose “I have a trustee code”.'
              : mode === 'forgot'
                ? 'We’ll email you a link to choose a new password.'
                : 'For the Trust’s trustees and the students it supports.'}
        </p>

        {signedInWithoutProfile && (
          <p className="perror" role="alert">This login isn’t linked to the Trust yet. Ask a trustee to check your access.</p>
        )}

        {trustee && !codeOk && (
          <div className="pfield">
            <label htmlFor="l-tcode">Trustee code</label>
            <input id="l-tcode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off"
              autoCapitalize="characters" spellCheck={false} placeholder="e.g. K7QM2-XPA4B" autoFocus />
          </div>
        )}
        {trustee && codeOk && (
          <div className="pfield">
            <label htmlFor="l-name">Your name</label>
            <input id="l-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        )}
        {(!trustee || codeOk) && (
          <div className="pfield">
            <label htmlFor="l-email">Email</label>
            <input id="l-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
        )}
        {mode !== 'forgot' && (!trustee || codeOk) && (
          <div className="pfield">
            <label htmlFor="l-pw">{creating ? 'Choose a password' : 'Password'}</label>
            <input id="l-pw" type="password" autoComplete={creating ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
        )}
        {creating && (
          <div className="pfield">
            <label htmlFor="l-pw2">Type the password again</label>
            <input id="l-pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        )}
        {mode === 'create' && (
          <div className="pfield">
            <label htmlFor="l-code">Access code</label>
            <input id="l-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off"
              autoCapitalize="characters" spellCheck={false} placeholder="e.g. K7QM-2XPA" />
          </div>
        )}

        {error && <p className="perror" role="alert">{error}</p>}
        {info && <p className="pinfo" role="status">{info}</p>}

        <button type="submit" className="pbtn primary block" disabled={busy}>
          {busy ? 'Please wait…'
            : trustee ? (codeOk ? 'Create trustee login' : 'Continue')
              : mode === 'create' ? 'Create login' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
        </button>

        <div className="plogin-links">
          {trustee && codeOk && <button type="button" onClick={() => { setCodeOk(false); setError(''); }}>Use a different code</button>}
          {mode !== 'signin' && <button type="button" onClick={() => go('signin')}>Back to sign in</button>}
          {mode === 'signin' && <button type="button" onClick={() => go('create')}>First time here? Create your login</button>}
          {mode === 'signin' && <button type="button" onClick={() => go('trustee')}>I have a trustee code</button>}
          {mode === 'signin' && <button type="button" onClick={() => go('forgot')}>Forgot password?</button>}
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
