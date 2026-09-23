import type { HTMLAttributes, KeyboardEvent } from 'react';

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
          accept="image/*,.pdf"
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
