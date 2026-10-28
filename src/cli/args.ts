export type Parsed = { command: string[]; flags: Record<string, string | boolean>; positional: string[] };

/** Minimal argv parser: --flag, --flag=value, --flag value, -x shorthand. */
export function parseArgs(argv: string[]): Parsed {
  const flags: Record<string, string | boolean> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { rest.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) { flags[body.slice(0, eq)] = body.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) { flags[body] = next; i++; }
      else flags[body] = true;
      continue;
    }
    if (a.startsWith('-') && a.length === 2) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) { flags[a.slice(1)] = next; i++; }
      else flags[a.slice(1)] = true;
      continue;
    }
    rest.push(a);
  }
  const command: string[] = [];
  while (rest.length && !command.includes('--')) {
    if (command.length >= 3) break;
    const next = rest[0];
    if (next === undefined) break;
    command.push(rest.shift()!);
  }
  return { command, flags, positional: rest };
}

export const str = (f: Record<string, string | boolean>, k: string, fallback?: string): string | undefined => {
  const v = f[k];
  if (typeof v === 'string') return v;
  if (v === true) return '';
  return fallback;
};
export const num = (f: Record<string, string | boolean>, k: string): number | undefined => {
  const v = str(f, k);
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
export const flag = (f: Record<string, string | boolean>, k: string): boolean => f[k] === true || f[k] === 'true' || f[k] === '1';
export const list = (f: Record<string, string | boolean>, k: string): string[] => {
  const v = str(f, k);
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
};
