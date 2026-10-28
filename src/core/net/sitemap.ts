import { safeFetch } from './safe-fetch';
import { decode } from '../html/parse';
import { err, ok, unique, type Result } from '../util';

export type SitemapResult = {
  url: string;
  status: number;
  kind: 'urlset' | 'sitemapindex' | 'not_xml' | 'error';
  urls: string[];
  children: string[];
  note?: string;
};

function tagValues(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(decode(m[1].trim()));
  return out;
}

export async function fetchSitemap(url: string, userAgent: string): Promise<Result<SitemapResult>> {
  const res = await safeFetch(url, { userAgent, maxBytes: 10_000_000, accept: 'application/xml,text/xml,*/*' });
  if (!res.ok) return err(res.error);
  const p = res.value;
  if (p.status >= 400) {
    return ok({ url, status: p.status, kind: 'error', urls: [], children: [], note: `HTTP ${p.status}` });
  }
  const body = p.body.trim();
  const isXml = body.startsWith('<?xml') || /<(urlset|sitemapindex)/i.test(body);
  if (!isXml) {
    // A plain-text sitemap (one URL per line) is also valid per sitemaps.org.
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^https?:\/\//i.test(l));
    if (lines.length) return ok({ url, status: p.status, kind: 'urlset', urls: unique(lines), children: [] });
    return ok({ url, status: p.status, kind: 'not_xml', urls: [], children: [], note: `content-type ${p.contentType || 'unknown'}` });
  }
  if (/<sitemapindex/i.test(body)) {
    const children = tagValues(body, 'loc');
    return ok({ url, status: p.status, kind: 'sitemapindex', urls: [], children: unique(children) });
  }
  return ok({ url, status: p.status, kind: 'urlset', urls: unique(tagValues(body, 'loc')), children: [] });
}

/** Resolves a sitemap index up to `maxChildren` deep, returning every URL found. */
export async function collectSitemapUrls(
  roots: string[],
  userAgent: string,
  maxUrls = 2000,
  maxChildren = 10
): Promise<{ urls: string[]; sources: SitemapResult[] }> {
  const sources: SitemapResult[] = [];
  const urls: string[] = [];
  const queue = [...roots];
  const visited = new Set<string>();
  let childrenFetched = 0;

  while (queue.length && urls.length < maxUrls) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    const r = await fetchSitemap(next, userAgent);
    if (!r.ok) {
      sources.push({ url: next, status: 0, kind: 'error', urls: [], children: [], note: r.error });
      continue;
    }
    sources.push(r.value);
    urls.push(...r.value.urls);
    for (const c of r.value.children) {
      if (childrenFetched++ < maxChildren) queue.push(c);
    }
  }
  return { urls: unique(urls).slice(0, maxUrls), sources };
}
