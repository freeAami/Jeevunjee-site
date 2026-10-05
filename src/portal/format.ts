import type { Currency, Instalment } from './types';

const N = new Intl.NumberFormat('en-LK', { maximumFractionDigits: 2 });
const SYMBOL: Record<Currency, string> = { GBP: '£', USD: '$', EUR: '€', AUD: 'A$' };

export const fmtLkr = (n: number) => `Rs ${N.format(Math.round(n * 100) / 100)}`;
export const fmtForeign = (n: number, c: Currency | null) => `${c ? SYMBOL[c] : ''}${N.format(n)}`;

/** "Rs 50,000 + £325", "£950", or "Rs 0". */
export function fmtAmount(lkr: number, foreign: number, currency: Currency | null) {
  const parts = [];
  if (lkr) parts.push(fmtLkr(lkr));
  if (foreign) parts.push(fmtForeign(foreign, currency));
  return parts.join(' + ') || 'Rs 0';
}

/** Add up mixed rupee + foreign amounts without pretending they're one currency. */
export function sumMixed(rows: { lkr: number; foreign: number; currency: Currency | null }[]) {
  let lkr = 0;
  const foreign = new Map<Currency, number>();
  for (const r of rows) {
    lkr += r.lkr || 0;
    if (r.foreign && r.currency) foreign.set(r.currency, (foreign.get(r.currency) ?? 0) + r.foreign);
  }
  return { lkr, foreign };
}

export function fmtMixed(m: { lkr: number; foreign: Map<Currency, number> }) {
  const parts = [];
  if (m.lkr) parts.push(fmtLkr(m.lkr));
  for (const [c, v] of m.foreign) if (v) parts.push(fmtForeign(v, c));
  return parts.join(' + ') || 'Rs 0';
}

export const today = () => new Date().toISOString().slice(0, 10);

export function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysFromToday(d: string) {
  const a = new Date(`${today()}T00:00:00`).getTime();
  const b = new Date(`${d}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export type DueState = 'paid' | 'cancelled' | 'overdue' | 'soon' | 'upcoming' | 'unscheduled';

export function dueState(i: Instalment): DueState {
  if (i.status === 'paid') return 'paid';
  if (i.status === 'cancelled') return 'cancelled';
  if (!i.due_date) return 'unscheduled';
  const d = daysFromToday(i.due_date);
  if (d < 0) return 'overdue';
  if (d <= 30) return 'soon';
  return 'upcoming';
}

export function relativeDue(d: string | null) {
  if (!d) return 'No date set';
  const n = daysFromToday(d);
  if (n === 0) return 'Due today';
  if (n < 0) return `${-n} day${n === -1 ? '' : 's'} overdue`;
  if (n <= 60) return `In ${n} day${n === 1 ? '' : 's'}`;
  return fmtDate(d);
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export const fmtBytes = (n: number | null) =>
  n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
