import type { ReactNode } from 'react';

export function PageHeader({ title, lede, actions }: { title: string; lede?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {lede && <p className="mt-1 max-w-prose text-[0.875rem]" style={{ color: 'var(--text-dim)' }}>{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function NoProject() {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <h1 className="text-lg font-semibold">No project yet</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--text-dim)' }}>
        LaunchOS works per project, so create one first. You can run as many as you like in one install,
        and their data stays separate.
      </p>
      <a className="btn btn-primary mt-4" href="/projects/new">Create a project</a>
    </div>
  );
}
