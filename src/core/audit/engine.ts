import { HostThrottle, safeFetch, assertSafeUrl, DEFAULTS } from '../net/safe-fetch';
import { fetchRobots, isAllowed, type Robots } from '../net/robots';
import { collectSitemapUrls, type SitemapResult } from '../net/sitemap';
import { extractPage, safeHost, type PageFacts } from './extract';
import { runChecks, normalizeForCompare, detectFramework, type Finding, type SiteContext } from './checks';
import { validateJsonLd } from './schema-validate';
import { responseTiming, tryLighthouse, type PerfResult } from './lighthouse';
import { err, ok, unique, type Result } from '../util';

export type CrawlOptions = {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  sitemapUrl?: string;
  checkBrokenLinks?: boolean;
  runLighthouse?: boolean;
  userAgent?: string;
  /** Hosts the operator has registered as theirs. The crawl never leaves them. */
  authorizedHosts: string[];
  onProgress?: (msg: string) => void;
};

export type Skip = { url: string; reason: string };

export type AuditResult = {
  startUrl: string;
  /** False when robots.txt was unreachable, so link discovery was disabled. */
  linkDiscovery: boolean;
  origin: string;
  pages: PageFacts[];
  findings: Finding[];
  robots: Robots | null;
  robotsReachable: boolean;
  sitemapSources: SitemapResult[];
  sitemapUrls: string[];
  skipped: Skip[];
  performance: { url: string; result: PerfResult }[];
  structured: { url: string; types: string[]; valid: boolean; problems: string[]; raw: string }[];
  framework: string;
  requestedPages: number;
};

const HARD_PAGE_CAP = Number(process.env.LAUNCHOS_CRAWL_MAX_PAGES || 40);

/**
 * Crawls a site the operator has declared as theirs and returns evidence-backed findings.
 *
 * Safety invariants, all enforced here rather than trusted from the caller:
 *   - every URL (including each redirect hop) passes the SSRF guard;
 *   - the crawl never leaves the authorized host list;
 *   - robots.txt Disallow is honoured for our user agent;
 *   - requests to one host are serialized and spaced out;
 *   - page count and crawl depth are capped.
 */
export async function runAudit(opts: CrawlOptions): Promise<Result<AuditResult>> {
  const log = opts.onProgress ?? (() => {});
  const ua = opts.userAgent ?? DEFAULTS.userAgent;
  const maxPages = Math.min(opts.maxPages ?? HARD_PAGE_CAP, HARD_PAGE_CAP);
  const maxDepth = opts.maxDepth ?? 2;

  const startSafe = await assertSafeUrl(opts.startUrl);
  if (!startSafe.ok) return startSafe;
  const start = startSafe.value;
  const origin = start.origin;
  const authorized = new Set(opts.authorizedHosts.map((h) => h.toLowerCase().replace(/^www\./, '')));
  if (!authorized.size) return err('no authorized host registered for this project; add and authorize a domain first');
  if (!authorized.has(safeHost(origin))) {
    return err(`host ${safeHost(origin)} is not in this project's authorized host list (${[...authorized].join(', ')})`);
  }

  const throttle = new HostThrottle();
  const skipped: Skip[] = [];

  log('fetching robots.txt');
  const robotsRes = await fetchRobots(origin, ua);
  const robots = robotsRes.ok ? robotsRes.value : null;
  const robotsReachable = robotsRes.ok;
  // With crawl rules unknown we do not go exploring: only the start URL and
  // URLs the site itself published in its sitemap are requested.
  const linkDiscovery = robotsReachable;
  if (!robotsReachable) log(`robots.txt unreachable (${robotsRes.ok ? '' : robotsRes.error}); link discovery disabled for this run`);

  const sitemapCandidates = unique([
    ...(opts.sitemapUrl ? [opts.sitemapUrl] : []),
    ...(robots?.sitemaps ?? []),
    new URL('/sitemap.xml', origin).toString(),
  ]);
  log(`resolving ${sitemapCandidates.length} sitemap candidate(s)`);
  const { urls: sitemapUrls, sources: sitemapSources } = await collectSitemapUrls(sitemapCandidates, ua);

  const queue: { url: string; depth: number; fromSitemap: boolean }[] = [{ url: start.toString(), depth: 0, fromSitemap: false }];
  for (const u of sitemapUrls) {
    if (authorized.has(safeHost(u))) queue.push({ url: u, depth: 1, fromSitemap: true });
  }

  const seen = new Set<string>();
  const pages: PageFacts[] = [];
  let framework = 'unknown';

  while (queue.length && pages.length < maxPages) {
    const item = queue.shift()!;
    const key = normalizeForCompare(item.url);
    if (seen.has(key)) continue;
    seen.add(key);

    const host = safeHost(item.url);
    if (!authorized.has(host)) {
      skipped.push({ url: item.url, reason: `host ${host} not authorized` });
      continue;
    }
    if (robots && robots.state === 'parsed') {
      const path = pathWithQuery(item.url);
      if (!isAllowed(robots, path, ua)) {
        skipped.push({ url: item.url, reason: 'disallowed by robots.txt' });
        continue;
      }
    }
    if (robots && robots.state === 'unknown') {
      skipped.push({ url: item.url, reason: 'robots.txt returned a server error; crawling halted for safety' });
      break;
    }

    await throttle.wait(host);
    log(`crawling (${pages.length + 1}/${maxPages}) ${item.url}`);
    const res = await safeFetch(item.url, { userAgent: ua });
    if (!res.ok) {
      skipped.push({ url: item.url, reason: res.error });
      continue;
    }
    const facts = extractPage(res.value, origin);
    pages.push(facts);
    if (pages.length === 1) framework = detectFramework(res.value.body, res.value.headers);

    if (linkDiscovery && item.depth < maxDepth) {
      for (const link of facts.internalLinks) {
        if (!authorized.has(safeHost(link))) continue;
        if (seen.has(normalizeForCompare(link))) continue;
        queue.push({ url: link, depth: item.depth + 1, fromSitemap: false });
      }
    }
  }

  if (!pages.length) return err(`crawl produced no pages. ${skipped.map((s) => `${s.url}: ${s.reason}`).join('; ') || 'no reason recorded'}`);

  const brokenInternalLinks: SiteContext['brokenInternalLinks'] = [];
  if (opts.checkBrokenLinks !== false) {
    const crawled = new Set(pages.map((p) => normalizeForCompare(p.finalUrl)));
    const errorPages = new Map(pages.filter((p) => p.status >= 400).map((p) => [normalizeForCompare(p.finalUrl), p.status]));
    const candidates: { from: string; to: string }[] = [];
    for (const p of pages) {
      for (const l of p.internalLinks) {
        const k = normalizeForCompare(l);
        if (errorPages.has(k)) brokenInternalLinks.push({ from: p.url, to: l, status: errorPages.get(k)! });
        else if (!crawled.has(k)) candidates.push({ from: p.url, to: l });
      }
    }
    const toCheck = unique(candidates.map((c) => c.to)).slice(0, 25);
    log(`verifying ${toCheck.length} unvisited internal link target(s)`);
    for (const target of toCheck) {
      await throttle.wait(safeHost(target));
      const r = await safeFetch(target, { method: 'HEAD', userAgent: ua, maxBytes: 1 });
      const status = r.ok ? r.value.status : r.error;
      if (!r.ok || r.value.status >= 400) {
        const from = candidates.find((c) => c.to === target)?.from ?? '';
        brokenInternalLinks.push({ from, to: target, status });
      }
    }
  }

  const ctx: SiteContext = {
    origin,
    robots,
    robotsReachable,
    sitemaps: sitemapSources,
    sitemapUrls,
    brokenInternalLinks,
    framework: framework as SiteContext['framework'],
    requestedPages: seen.size,
  };
  const findings = runChecks(pages, ctx);

  const home = pages[0];
  const performance: AuditResult['performance'] = [{ url: home.finalUrl, result: responseTiming(home.elapsedMs, home.bytes) }];
  if (opts.runLighthouse) {
    log('attempting optional Lighthouse run');
    const lh = await tryLighthouse(home.finalUrl);
    if (lh) performance.push({ url: home.finalUrl, result: lh });
    else
      performance.push({
        url: home.finalUrl,
        result: {
          available: false,
          source: 'lighthouse',
          measurementKind: 'lab',
          metrics: {},
          note: 'Lighthouse is not installed locally, so no lab metrics were collected. LaunchOS never installs it for you. Install it with `npm i -g lighthouse` (free, needs a local Chrome).',
        },
      });
  }

  const structured: AuditResult['structured'] = [];
  for (const p of pages) {
    for (const block of p.jsonLd) {
      if (block.parseError) {
        structured.push({ url: p.url, types: [], valid: false, problems: [`JSON parse error: ${block.parseError}`], raw: block.raw.slice(0, 4000) });
        continue;
      }
      const v = validateJsonLd(block.parsed, p.text);
      structured.push({
        url: p.url,
        types: v.types,
        valid: v.valid,
        problems: v.problems.map((x) => `${x.level}: ${x.message}`),
        raw: block.raw.slice(0, 4000),
      });
    }
  }

  return ok({
    startUrl: opts.startUrl,
    linkDiscovery,
    origin,
    pages,
    findings,
    robots,
    robotsReachable,
    sitemapSources,
    sitemapUrls,
    skipped,
    performance,
    structured,
    framework,
    requestedPages: seen.size,
  });
}

function pathWithQuery(u: string): string {
  try {
    const x = new URL(u);
    return x.pathname + (x.search || '');
  } catch {
    return '/';
  }
}

export const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
export function sortFindings(fs: Finding[]): Finding[] {
  return [...fs].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || a.checkId.localeCompare(b.checkId));
}
