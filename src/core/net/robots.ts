import { safeFetch } from './safe-fetch';
import { err, ok, type Result } from '../util';

export type RobotsRule = { allow: boolean; path: string };
export type RobotsGroup = { agents: string[]; rules: RobotsRule[]; crawlDelay?: number };
export type Robots = {
  fetched: boolean;
  status: number | null;
  raw: string;
  groups: RobotsGroup[];
  sitemaps: string[];
  /** No robots.txt (404) means "crawl allowed"; a 5xx means "unknown". */
  state: 'allow_all' | 'parsed' | 'unknown' | 'missing';
};

export function parseRobots(raw: string): Pick<Robots, 'groups' | 'sitemaps'> {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const line of raw.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const idx = clean.indexOf(':');
    if (idx === -1) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === 'sitemap') {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === 'allow') current.rules.push({ allow: true, path: value });
    else if (field === 'disallow') current.rules.push({ allow: false, path: value });
    else if (field === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }
  return { groups, sitemaps };
}

export async function fetchRobots(origin: string, userAgent: string): Promise<Result<Robots>> {
  const url = new URL('/robots.txt', origin).toString();
  // One retry: a single network blip here must not silently turn into
  // "crawl rules unknown", which would either over-report or under-protect.
  let res = await safeFetch(url, { userAgent, maxBytes: 500_000, accept: 'text/plain,*/*' });
  if (!res.ok) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await safeFetch(url, { userAgent, maxBytes: 500_000, accept: 'text/plain,*/*' });
  }
  if (!res.ok) return err(`robots.txt unreachable after 2 attempts: ${res.error}`);
  const p = res.value;
  if (p.status === 404 || p.status === 410) {
    return ok({ fetched: true, status: p.status, raw: '', groups: [], sitemaps: [], state: 'missing' });
  }
  if (p.status >= 400) {
    return ok({ fetched: true, status: p.status, raw: '', groups: [], sitemaps: [], state: 'unknown' });
  }
  const parsed = parseRobots(p.body);
  return ok({ fetched: true, status: p.status, raw: p.body, ...parsed, state: 'parsed' });
}

/** Longest-match Allow/Disallow evaluation, matching Google's documented behaviour. */
export function isAllowed(robots: Robots, pathWithQuery: string, userAgent: string): boolean {
  if (robots.state === 'missing' || robots.state === 'allow_all') return true;
  if (robots.state === 'unknown') return false;
  const ua = userAgent.toLowerCase();
  const scored = robots.groups
    .map((g) => {
      const match = g.agents
        .map((a) => (a === '*' ? 0.5 : ua.includes(a) ? a.length : -1))
        .reduce((m, s) => Math.max(m, s), -1);
      return { g, match };
    })
    .filter((x) => x.match >= 0)
    .sort((a, b) => b.match - a.match);
  if (!scored.length) return true;
  const group = scored[0].g;

  let best: { len: number; allow: boolean } | null = null;
  for (const rule of group.rules) {
    if (rule.path === '') continue;
    if (!matchRobotsPath(rule.path, pathWithQuery)) continue;
    const len = rule.path.replace(/[*$]/g, '').length;
    if (!best || len > best.len || (len === best.len && rule.allow)) best = { len, allow: rule.allow };
  }
  return best ? best.allow : true;
}

export function matchRobotsPath(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const parts = body.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('^' + parts.join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}
