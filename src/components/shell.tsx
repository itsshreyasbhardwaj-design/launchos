'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Nav } from './nav';
import { ThemeToggle } from './theme-toggle';
import { ProjectSwitcher } from './project-switcher';

export function Shell({
  modules, projects, activeId, activeName, children,
}: {
  modules: string[];
  projects: { id: string; name: string; preset: string }[];
  activeId: string | null;
  activeName: string | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-2.5 lg:hidden"
        style={{ background: 'var(--surface)' }}
      >
        <button type="button" className="btn btn-ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="sidebar">
          <span aria-hidden>☰</span><span className="sr-only">Menu</span>
        </button>
        <Link href="/" className="font-semibold tracking-tight">LaunchOS</Link>
        <span className="ml-auto" />
        <ThemeToggle />
      </header>

      <aside
        id="sidebar"
        className={`${open ? 'block' : 'hidden'} border-b px-3 py-4 lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r`}
        style={{ background: 'var(--surface)' }}
      >
        <div className="mb-5 hidden items-center gap-2 px-2 lg:flex">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-md text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))' }}
          >
            L
          </span>
          <Link href="/" className="text-[0.9375rem] font-semibold tracking-tight">LaunchOS</Link>
          <span className="ml-auto"><ThemeToggle /></span>
        </div>

        <div className="mb-5 px-2">
          <p className="label">Active project</p>
          {projects.length
            ? <ProjectSwitcher projects={projects} activeId={activeId} />
            : <Link href="/projects/new" className="btn btn-primary w-full justify-center">Create a project</Link>}
          {activeName && projects.length > 1 && (
            <p className="mt-1.5 text-xs" style={{ color: 'var(--text-dim)' }}>
              Everything below is scoped to {activeName}.
            </p>
          )}
        </div>

        <Nav modules={modules} onNavigate={() => setOpen(false)} />

        <p className="mt-6 px-2 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-dim)' }}>
          Local-first and free. No paid API is required, and nothing is published without your approval.
        </p>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
