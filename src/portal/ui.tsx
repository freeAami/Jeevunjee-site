import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { friendlyError, type PortalApi } from './api';
import { initials } from './format';
import type { Profile, Student } from './types';

// ---------------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------------

type Portal = { api: PortalApi; profile: Profile; navigate: (path: string) => void; email: string };
export const PortalContext = createContext<Portal | null>(null);
export function usePortal() {
  const p = useContext(PortalContext);
  if (!p) throw new Error('usePortal outside portal');
  return p;
}

export function navigateTo(path: string) {
  location.hash = `#/portal${path}`;
}

/** Load something async; `reload()` re-runs it. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    fn().then(
      (data) => live && setState({ data, loading: false }),
      (e) => live && setState({ error: friendlyError(e), loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

// ---------------------------------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------------------------------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'quiet'; small?: boolean };
export function Button({ variant = 'ghost', small, className = '', type = 'button', ...rest }: BtnProps) {
  return <button type={type} className={`pbtn ${variant}${small ? ' small' : ''} ${className}`} {...rest} />;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'paid' | 'overdue' | 'soon' | 'gold' | 'muted'; children: ReactNode }) {
  return <span className={`pbadge ${tone}`}>{children}</span>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="ploading" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="perror" role="alert">
      <span>{message}</span>
      {onRetry && <Button small onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="pempty">{children}</p>;
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`pcard ${className}`}>
      {(title || actions) && (
        <header className="pcard-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="pcard-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------------

export function Field({ label, hint, error, children, wide }: { label: string; hint?: string; error?: string; children: (id: string) => ReactNode; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`pfield${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="err">{error}</small>}
    </div>
  );
}

type Opt = { value: string; label: string };
export function Select({ id, value, onChange, options, placeholder }: { id: string; value: string; onChange: (v: string) => void; options: Opt[]; placeholder?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Number input that keeps what the user typed ("1,320,000" is fine) and reports a number. */
export function MoneyInput({ id, value, onChange, placeholder }: { id: string; value: number | null; onChange: (v: number) => void; placeholder?: string }) {
  const [text, setText] = useState(value ? String(value) : '');
  useEffect(() => {
    const parsed = Number(text.replace(/,/g, '')) || 0;
    if ((value ?? 0) !== parsed) setText(value ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      inputMode="decimal"
      value={text}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        onChange(Number(t.replace(/,/g, '')) || 0);
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------------
// Modal (native <dialog>: focus trapping, Esc and backdrop come for free)
// ---------------------------------------------------------------------------------------------------

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`pmodal${wide ? ' wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="pmodal-inner">
        <header>
          <h2>{title}</h2>
          <button type="button" className="pmodal-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="pmodal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </dialog>
  );
}

/** Standard save/cancel footer with busy + error handling. */
export function useSaver(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

// ---------------------------------------------------------------------------------------------------
// Student photo / initials
// ---------------------------------------------------------------------------------------------------

const urlCache = new Map<string, Promise<string>>();

export function useFileUrl(bucket: string | null, path: string | null) {
  const { api } = usePortal();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!bucket || !path) return setUrl(null);
    const key = `${bucket}/${path}`;
    if (!urlCache.has(key)) urlCache.set(key, api.fileUrl(bucket, path));
    let live = true;
    urlCache.get(key)!.then(
      (u) => live && setUrl(u),
      () => urlCache.delete(key),
    );
    return () => {
      live = false;
    };
  }, [api, bucket, path]);
  return url;
}

export function Avatar({ student, size = 40 }: { student: Pick<Student, 'full_name' | 'photo_bucket' | 'photo_path'>; size?: number }) {
  const url = useFileUrl(student.photo_bucket, student.photo_path);
  return (
    <span className="pavatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(student.full_name)}
    </span>
  );
}

/** Name + code together, so two students with the same name are never confused. */
export function StudentName({ student }: { student: Pick<Student, 'full_name' | 'code' | 'preferred_name'> }) {
  return (
    <span className="pstudent-name">
      <span className="n">{student.full_name}</span>
      <span className="code">{student.code}</span>
    </span>
  );
}
