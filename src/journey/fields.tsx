import { useEffect, useState, type HTMLAttributes, type KeyboardEvent } from 'react';
import { ACCEPT_ATTR, ACCEPT_IMAGES } from '../lib/files';

type TextFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  big?: boolean;
  textarea?: boolean;
  rows?: number;
  optional?: boolean;
  hideLabel?: boolean;
  error?: string;
  autoComplete?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
};

export function TextField(p: TextFieldProps) {
  const errId = `${p.id}-err`;
  const shared = {
    id: p.id,
    name: p.id,
    value: p.value,
    placeholder: p.placeholder,
    className: `text-input${p.big ? ' big' : ''}`,
    'aria-invalid': p.error ? true : undefined,
    'aria-describedby': p.error ? errId : undefined,
  };
  return (
    <div className="field">
      <label htmlFor={p.id} className={p.hideLabel ? 'sr-only' : 'field-label'}>
        {p.label}
        {p.optional && <span className="opt"> · optional</span>}
      </label>
      {p.textarea ? (
        <textarea {...shared} rows={p.rows ?? 4} onChange={(e) => p.onChange(e.target.value)} />
      ) : (
        <input {...shared} type={p.type ?? 'text'} autoComplete={p.autoComplete} inputMode={p.inputMode}
          onChange={(e) => p.onChange(e.target.value)} />
      )}
      {p.error && <p className="scene-error" id={errId} role="alert">{p.error}</p>}
    </div>
  );
}

type Option = { value: string; label: string; hint?: string };

/** Card-style single choice. Arrow keys move between cards; Enter/Space picks. */
export function Choices(p: { name: string; label: string; value: string; options: Option[]; onPick: (v: string) => void; error?: string }) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + p.options.length) % p.options.length;
    document.getElementById(`${p.name}-${j}`)?.focus();
  };
  const active = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  return (
    <>
      <div className="choices" role="radiogroup" aria-label={p.label}>
        {p.options.map((o, i) => {
          const checked = p.value === o.value;
          return (
            <button
              key={o.value}
              id={`${p.name}-${i}`}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === active ? 0 : -1}
              className="choice"
              style={{ animationDelay: `${320 + i * 90}ms` }}
              onClick={() => p.onPick(o.value)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className="choice-dot" aria-hidden="true" />
              <span>
                <span className="choice-label" style={{ display: 'block' }}>{o.label}</span>
                {o.hint && <span className="choice-hint" style={{ display: 'block' }}>{o.hint}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {p.error && <p className="scene-error" role="alert">{p.error}</p>}
    </>
  );
}

export function FileField(p: { id: string; label: string; file: File | null; onChange: (f: File | null) => void; optional?: boolean; error?: string }) {
  return (
    <div className="field">
      <div className="field-label" id={`${p.id}-label`}>
        {p.label}
        {p.optional && <span className="opt"> · optional</span>}
      </div>
      <label className="file-drop">
        <span className={`name${p.file ? ' has' : ''}`}>{p.file ? p.file.name : 'A phone photo is completely fine'}</span>
        <span className="pill" aria-hidden="true">{p.file ? 'Replace' : 'Upload'}</span>
        <input
          id={p.id}
          type="file"
          accept={ACCEPT_ATTR}
          className="sr-only"
          aria-labelledby={`${p.id}-label`}
          aria-invalid={p.error ? true : undefined}
          onChange={(e) => p.onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      {p.error && <p className="scene-error" role="alert">{p.error}</p>}
    </div>
  );
}

/** Small inline single-choice (e.g. 1 / 2 / 3 / 4 years). Arrow keys move; Enter/Space picks. */
export function Chips(p: { name: string; label: string; value: string; options: { value: string; label: string }[]; onPick: (v: string) => void; error?: string; hideLabel?: boolean }) {
  const active = Math.max(0, p.options.findIndex((o) => o.value === p.value));
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + p.options.length) % p.options.length;
    document.getElementById(`${p.name}-${j}`)?.focus();
    p.onPick(p.options[j].value);
  };
  return (
    <div className="field">
      <div className={p.hideLabel ? 'sr-only' : 'field-label'} id={`${p.name}-label`}>{p.label}</div>
      <div className="chips" role="radiogroup" aria-labelledby={`${p.name}-label`}>
        {p.options.map((o, i) => (
          <button key={o.value} id={`${p.name}-${i}`} type="button" role="radio" aria-checked={p.value === o.value}
            tabIndex={i === active ? 0 : -1} className="chip" onClick={() => p.onPick(o.value)} onKeyDown={(e) => onKey(e, i)}>
            {o.label}
          </button>
        ))}
      </div>
      {p.error && <p className="scene-error" role="alert">{p.error}</p>}
    </div>
  );
}

/** Passport-photo picker with a live preview. */
export function PhotoField(p: { id: string; label: string; file: File | null; onChange: (f: File | null) => void; error?: string }) {
  const url = useObjectUrl(p.file);
  return (
    <div className="field">
      <div className="field-label" id={`${p.id}-label`}>{p.label}</div>
      <label className={`photo-drop${p.file ? ' has' : ''}`}>
        <span className="photo-frame" aria-hidden="true">{url ? <img src={url} alt="" /> : <span>Photo</span>}</span>
        <span className="photo-text">
          <span className="t">{p.file ? 'Looks good — tap to change' : 'Add a clear photo of your face'}</span>
          <span className="h">Like a passport picture. A phone selfie against a plain wall is fine.</span>
        </span>
        <input id={p.id} type="file" accept={ACCEPT_IMAGES} className="sr-only" aria-labelledby={`${p.id}-label`}
          aria-invalid={p.error ? true : undefined} onChange={(e) => p.onChange(e.target.files?.[0] ?? null)} />
      </label>
      {p.error && <p className="scene-error" role="alert">{p.error}</p>}
    </div>
  );
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

/** Yes/no switch. */
export function Switch(p: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch" htmlFor={p.id}>
      <input id={p.id} type="checkbox" role="switch" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span className="track" aria-hidden="true"><span className="thumb" /></span>
      <span>{p.label}</span>
    </label>
  );
}
