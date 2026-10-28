import Link from 'next/link';
import type { ReactNode } from 'react';

export function Card({ title, subtitle, actions, children, className = '' }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold leading-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Badge({ children, kind }: { children: ReactNode; kind?: string }) {
  return <span className={`badge ${kind ? `badge-${kind}` : ''}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>{hint}</div>}
    </div>
  );
}

export function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed p-6">
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-prose text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>{body}</p>
      {cta && <Link className="btn btn-primary mt-1" href={cta.href}>{cta.label}</Link>}
    </div>
  );
}

export function Note({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <p className={`note ${warn ? 'note-warn' : ''}`}>{children}</p>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs" style={{ color: 'var(--text-dim)' }}>{hint}</span>}
    </label>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="data">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Horizontal bar chart in plain SVG — no charting library, no bundle cost. */
export function BarChart({ data, unit = '' }: { data: { label: string; value: number }[]; unit?: string }) {
  if (!data.length) return <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No data.</p>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs" title={d.label}>{d.label}</div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
            </div>
          </div>
          <div className="text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>{d.value.toLocaleString()}{unit}</div>
        </div>
      ))}
    </div>
  );
}

export function SeverityDots({ counts }: { counts: Record<string, number> }) {
  const order: { k: string; c: string }[] = [
    { k: 'critical', c: '#e11d48' }, { k: 'high', c: '#f43f5e' },
    { k: 'medium', c: '#f59e0b' }, { k: 'low', c: '#06b6d4' }, { k: 'info', c: '#64748b' },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {order.filter((o) => counts[o.k]).map((o) => (
        <span key={o.k} className="inline-flex items-center gap-1.5 text-xs">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: o.c }} />
          <span className="tabular-nums font-semibold">{counts[o.k]}</span>
          <span style={{ color: 'var(--text-dim)' }}>{o.k}</span>
        </span>
      ))}
      {!Object.values(counts).some(Boolean) && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>No findings.</span>}
    </div>
  );
}

export function Submit({ children, variant = 'primary' }: { children: ReactNode; variant?: 'primary' | 'ghost' }) {
  return <button type="submit" className={`btn ${variant === 'primary' ? 'btn-primary' : 'btn-ghost'}`}>{children}</button>;
}
