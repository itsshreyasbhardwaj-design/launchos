import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { err, ok, type Result } from '../util';

export type FetchOpts = {
  method?: 'GET' | 'HEAD';
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  accept?: string;
};

export type FetchedPage = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirectChain: { url: string; status: number; location: string }[];
  headers: Record<string, string>;
  contentType: string;
  body: string;
  bytes: number;
  elapsedMs: number;
  truncated: boolean;
};

export const DEFAULTS = {
  timeoutMs: Number(process.env.LAUNCHOS_CRAWL_TIMEOUT_MS || 15000),
  maxBytes: 3_000_000,
  maxRedirects: 5,
  userAgent: process.env.LAUNCHOS_USER_AGENT || 'LaunchOS-Audit/0.1 (+https://github.com/)',
};

const ALLOW_PRIVATE = process.env.LAUNCHOS_ALLOW_PRIVATE_HOSTS === '1';

/**
 * Rejects any URL that is not a plain public http(s) target.
 *
 * Blocks: non-http schemes, embedded credentials, literal and resolved private
 * / loopback / link-local / CGNAT / multicast / reserved addresses, and IPv6
 * equivalents. Every redirect hop is re-checked by `safeFetch`, so a public
 * host cannot bounce the crawler onto an internal address.
 */
export async function assertSafeUrl(raw: string): Promise<Result<URL>> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return err(`not a valid absolute URL: ${raw}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return err(`blocked scheme: ${u.protocol}`);
  if (u.username || u.password) return err('blocked: URL contains embedded credentials');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host) return err('blocked: empty host');
  if (ALLOW_PRIVATE) return ok(u);

  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.test|.*\.invalid|.*\.home\.arpa)$/i.test(host)) {
    return err(`blocked: non-public host name "${host}"`);
  }

  const literal = isIP(host);
  if (literal) {
    if (isPrivateAddress(host)) return err(`blocked: private or reserved IP ${host}`);
    return ok(u);
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    return err(`DNS lookup failed for ${host}`);
  }
  if (!addrs.length) return err(`no DNS records for ${host}`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) return err(`blocked: ${host} resolves to private address ${a.address}`);
  }
  return ok(u);
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51) return true;
    if (a === 203 && b === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true;
    if (/^f[cd]/.test(s)) return true;
    if (s.startsWith('ff')) return true;
    if (s.startsWith('::ffff:')) {
      const tail = s.slice(7);
      return isIP(tail) === 4 ? isPrivateAddress(tail) : true;
    }
    if (s.startsWith('2001:db8')) return true;
    return false;
  }
  return true;
}

/** Fetches one URL with manual redirect handling so each hop is re-validated. */
export async function safeFetch(url: string, opts: FetchOpts = {}): Promise<Result<FetchedPage>> {
  const o = { ...DEFAULTS, ...opts };
  const maxRedirects = opts.maxRedirects ?? DEFAULTS.maxRedirects;
  const started = Date.now();
  const chain: FetchedPage['redirectChain'] = [];
  const seen = new Set<string>();
  let current = url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safe = await assertSafeUrl(current);
    if (!safe.ok) return safe;
    if (seen.has(current)) return err(`redirect loop detected at ${current}`, { chain });
    seen.add(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeoutMs);
    let res: Response;
    try {
      res = await fetch(current, {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': o.userAgent,
          accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en',
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const msg = e instanceof Error ? e.message : String(e);
      return err(`request failed for ${current}: ${msg}`, { chain });
    }
    clearTimeout(timer);

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));

    if (res.status >= 300 && res.status < 400 && headers['location']) {
      let next: string;
      try {
        next = new URL(headers['location'], current).toString();
      } catch {
        return err(`unparseable redirect target "${headers['location']}" from ${current}`, { chain });
      }
      chain.push({ url: current, status: res.status, location: next });
      current = next;
      continue;
    }

    const { text, bytes, truncated } = await readCapped(res, o.maxBytes);
    return ok({
      requestedUrl: url,
      finalUrl: current,
      status: res.status,
      redirectChain: chain,
      headers,
      contentType: (headers['content-type'] || '').toLowerCase(),
      body: text,
      bytes,
      elapsedMs: Date.now() - started,
      truncated,
    });
  }
  return err(`too many redirects (> ${maxRedirects}) starting at ${url}`, { chain });
}

async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!res.body) return { text: '', bytes: 0, truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - maxBytes))));
      truncated = true;
      try { await reader.cancel(); } catch { /* stream already closed */ }
      break;
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { text: buf.toString('utf8'), bytes: truncated ? maxBytes : total, truncated };
}

/** Per-host politeness gate: serializes requests and spaces them out. */
export class HostThrottle {
  private last = new Map<string, number>();
  private queue = new Map<string, Promise<void>>();
  constructor(private delayMs = Number(process.env.LAUNCHOS_CRAWL_DELAY_MS || 750)) {}

  async wait(host: string): Promise<void> {
    const prev = this.queue.get(host) ?? Promise.resolve();
    let release: () => void = () => {};
    this.queue.set(host, new Promise<void>((r) => (release = r)));
    await prev;
    const since = Date.now() - (this.last.get(host) ?? 0);
    const delay = this.delayMs - since;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    this.last.set(host, Date.now());
    release();
  }
}
