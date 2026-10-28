import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { MIGRATIONS } from './migrations';
import { newId, nowIso } from '../util';

export type Row = Record<string, unknown>;

export interface Db {
  all<T = Row>(sql: string, ...params: unknown[]): T[];
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined;
  run(sql: string, ...params: unknown[]): void;
  tx<T>(fn: () => T): T;
  close(): void;
  path: string;
}

const DEFAULT_PATH = process.env.LAUNCHOS_DB || './data/launchos.db';
let shared: Db | null = null;

/** Opens (and migrates) the database. In-memory with ':memory:' for tests. */
export function openDb(path: string = DEFAULT_PATH): Db {
  const resolved = path === ':memory:' ? path : resolve(path);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const raw = new DatabaseSync(resolved);
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec('PRAGMA busy_timeout = 5000');

  const db: Db = {
    path: resolved,
    all<T>(sql: string, ...params: unknown[]) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
    get<T>(sql: string, ...params: unknown[]) {
      return raw.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    run(sql: string, ...params: unknown[]) {
      raw.prepare(sql).run(...(params as never[]));
    },
    tx<T>(fn: () => T) {
      raw.exec('BEGIN');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      raw.close();
    },
  };

  migrate(db);
  return db;
}

/** Process-wide handle used by the web app and CLI so both share one database. */
export function db(): Db {
  if (!shared) shared = openDb();
  return shared;
}

export function setSharedDb(d: Db): void {
  shared = d;
}

export function migrate(d: Db): { applied: number[]; version: number } {
  d.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`);
  const done = new Set(
    d.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version)
  );
  const applied: number[] = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    d.tx(() => {
      for (const stmt of splitSql(m.sql)) d.run(stmt);
      d.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?,?,?)', m.version, m.name, nowIso());
    });
    applied.push(m.version);
  }
  return { applied, version: MIGRATIONS[MIGRATIONS.length - 1].version };
}

/** Splits a migration into statements. Our SQL contains no semicolons in literals. */
function splitSql(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^--/.test(s));
}

export function logEvent(
  d: Db,
  e: { projectId?: string | null; actor: string; action: string; target?: string; detail?: unknown }
): void {
  d.run(
    'INSERT INTO audit_events (id, project_id, actor, action, target, detail_json, created_at) VALUES (?,?,?,?,?,?,?)',
    newId('ev'),
    e.projectId ?? null,
    e.actor,
    e.action,
    e.target ?? null,
    JSON.stringify(e.detail ?? {}),
    nowIso()
  );
}

export const j = {
  parse<T>(raw: unknown, fallback: T): T {
    if (typeof raw !== 'string' || raw === '') return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  stringify(v: unknown): string {
    return JSON.stringify(v ?? null);
  },
};

export const bool = (v: unknown): boolean => v === 1 || v === true || v === '1';
export const intOf = (v: boolean): number => (v ? 1 : 0);
