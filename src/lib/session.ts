import 'server-only';
import { cookies } from 'next/headers';
import { db, type Db } from '@/core/db';
import { listProjects, getProject, ensureWorkspace, type Project } from '@/core/services/projects';
import { seedRegistry } from '@/core/services/registry';

let bootstrapped = false;

/** Opens the shared database and seeds the registries on first use. */
export function database(): Db {
  const d = db();
  if (!bootstrapped) {
    ensureWorkspace(d);
    seedRegistry(d);
    bootstrapped = true;
  }
  return d;
}

export const PROJECT_COOKIE = 'launchos_project';

/** Resolves the active project from the cookie, falling back to the newest one. */
export async function activeProject(): Promise<Project | null> {
  const d = database();
  const store = await cookies();
  const id = store.get(PROJECT_COOKIE)?.value;
  if (id) {
    const p = getProject(d, id);
    if (p) return p;
  }
  return listProjects(d)[0] ?? null;
}

export async function allProjects(): Promise<Project[]> {
  return listProjects(database());
}

/** Resolves the active project or throws — for pages that cannot render without one. */
export async function requireActiveProject(): Promise<Project> {
  const p = await activeProject();
  if (!p) throw new Error('NO_PROJECT');
  return p;
}
