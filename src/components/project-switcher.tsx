'use client';

import { useRef } from 'react';
import { selectProject } from '@/app/actions';

export function ProjectSwitcher({ projects, activeId }: { projects: { id: string; name: string; preset: string }[]; activeId: string | null }) {
  const form = useRef<HTMLFormElement>(null);
  if (!projects.length) return null;
  return (
    <form ref={form} action={selectProject} className="min-w-0">
      <label className="sr-only" htmlFor="projectId">Active project</label>
      <select
        id="projectId"
        name="projectId"
        className="select"
        defaultValue={activeId ?? projects[0].id}
        onChange={() => form.current?.requestSubmit()}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <noscript><button type="submit" className="btn mt-1">Switch</button></noscript>
    </form>
  );
}
