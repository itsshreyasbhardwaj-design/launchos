const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);

export const c = {
  bold: wrap('1'), dim: wrap('2'), red: wrap('31'), green: wrap('32'),
  yellow: wrap('33'), blue: wrap('34'), cyan: wrap('36'), grey: wrap('90'),
};

export const SEVERITY_COLOR: Record<string, (s: string) => string> = {
  critical: c.red, high: c.red, medium: c.yellow, low: c.cyan, info: c.grey,
  pass: c.green, fail: c.red, unknown: c.yellow, ready: c.green, blocked: c.red, manual: c.yellow, missing: c.red,
};

export function heading(s: string): void {
  console.log('');
  console.log(c.bold(s));
  console.log(c.grey('─'.repeat(Math.min(72, Math.max(8, s.length)))));
}

export function kv(key: string, value: unknown): void {
  console.log(`  ${c.grey(key.padEnd(22))} ${value ?? c.grey('—')}`);
}

export function bullet(s: string, indent = 2): void {
  console.log(`${' '.repeat(indent)}${c.grey('•')} ${s}`);
}

export function table(rows: Record<string, unknown>[], columns?: string[]): void {
  if (!rows.length) { console.log(c.grey('  (none)')); return; }
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const widths = cols.map((col) => Math.min(52, Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))));
  console.log('  ' + cols.map((col, i) => c.grey(col.padEnd(widths[i]))).join('  '));
  for (const r of rows) {
    console.log('  ' + cols.map((col, i) => truncate(String(r[col] ?? ''), widths[i]).padEnd(widths[i])).join('  '));
  }
}

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

export function fail(message: string, detail?: unknown): never {
  console.error(`${c.red('error')} ${message}`);
  if (detail) console.error(c.grey(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2)));
  process.exitCode = 1;
  throw new ExitSignal();
}

export class ExitSignal extends Error {}

export function emit(json: boolean, data: unknown, human: () => void): void {
  if (json) console.log(JSON.stringify(data, null, 2));
  else human();
}
