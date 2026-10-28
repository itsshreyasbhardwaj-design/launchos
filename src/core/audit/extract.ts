import { byTag, byTagInDocument, insideAny, linkHref, metaContent, parseHtml, stripTags, type Doc } from '../html/parse';
import type { FetchedPage } from '../net/safe-fetch';
import { unique } from '../util';

export type LinkRef = { href: string; absolute: string | null; text: string; rel: string; internal: boolean; nofollow: boolean };
export type Heading = { level: number; text: string };
export type JsonLdBlock = { raw: string; parsed: unknown; parseError?: string };

export type PageFacts = {
  url: string;
  finalUrl: string;
  status: number;
  redirectChain: FetchedPage['redirectChain'];
  contentType: string;
  bytes: number;
  elapsedMs: number;
  isHtml: boolean;
  title?: string;
  titleCount: number;
  metaDescription?: string;
  metaDescriptionCount: number;
  canonical?: string;
  canonicalAbsolute?: string;
  metaRobots?: string;
  xRobotsTag?: string;
  noindex: boolean;
  nofollowPage: boolean;
  headings: Heading[];
  h1: string[];
  lang?: string;
  viewport?: string;
  charset?: string;
  og: Record<string, string>;
  twitter: Record<string, string>;
  hreflang: { lang: string; href: string }[];
  links: LinkRef[];
  internalLinks: string[];
  images: { src: string; alt?: string; hasAlt: boolean }[];
  jsonLd: JsonLdBlock[];
  wordCount: number;
  text: string;
  hasHttps: boolean;
};

export function extractPage(page: FetchedPage, siteOrigin: string): PageFacts {
  const isHtml = page.contentType.includes('html') || /^\s*<(?:!doctype|html)/i.test(page.body);
  const base: PageFacts = {
    url: page.requestedUrl,
    finalUrl: page.finalUrl,
    status: page.status,
    redirectChain: page.redirectChain,
    contentType: page.contentType,
    bytes: page.bytes,
    elapsedMs: page.elapsedMs,
    isHtml,
    titleCount: 0,
    metaDescriptionCount: 0,
    noindex: false,
    nofollowPage: false,
    headings: [],
    h1: [],
    og: {},
    twitter: {},
    hreflang: [],
    links: [],
    internalLinks: [],
    images: [],
    jsonLd: [],
    wordCount: 0,
    text: '',
    hasHttps: page.finalUrl.startsWith('https://'),
  };
  if (!isHtml) return base;

  const doc = parseHtml(page.body);
  // SVG and <template> subtrees carry their own <title>/<h1>; those are not document metadata.
  const titles = byTagInDocument(doc, 'title').map((t) => stripTags(t.text)).filter(Boolean);
  const descs = doc.els
    .filter((e) => e.tag === 'meta' && (e.attrs['name'] || '').toLowerCase() === 'description')
    .map((e) => e.attrs['content'] || '')
    .filter(Boolean);

  const metaRobots = metaContent(doc, 'robots');
  const xRobots = page.headers['x-robots-tag'];
  const directives = `${metaRobots || ''},${xRobots || ''}`.toLowerCase();

  const canonical = linkHref(doc, 'canonical');
  const html = doc.els.find((e) => e.tag === 'html');

  return {
    ...base,
    title: titles[0],
    titleCount: titles.length,
    metaDescription: descs[0],
    metaDescriptionCount: descs.length,
    canonical,
    canonicalAbsolute: canonical ? absolutize(canonical, page.finalUrl) ?? undefined : undefined,
    metaRobots,
    xRobotsTag: xRobots,
    noindex: /\bnoindex\b/.test(directives),
    nofollowPage: /\bnofollow\b/.test(directives),
    headings: headingsOf(doc),
    h1: byTagInDocument(doc, 'h1').map((h) => stripTags(h.text)).filter(Boolean),
    lang: html?.attrs['lang'],
    viewport: metaContent(doc, 'viewport'),
    charset: charsetOf(doc),
    og: prefixed(doc, 'og:'),
    twitter: prefixed(doc, 'twitter:'),
    hreflang: doc.els
      .filter((e) => e.tag === 'link' && (e.attrs['rel'] || '').toLowerCase().includes('alternate') && e.attrs['hreflang'])
      .map((e) => ({ lang: e.attrs['hreflang'], href: e.attrs['href'] || '' })),
    links: linksOf(doc, page.finalUrl, siteOrigin),
    internalLinks: unique(linksOf(doc, page.finalUrl, siteOrigin).filter((l) => l.internal && l.absolute).map((l) => l.absolute!)),
    images: byTagInDocument(doc, 'img').map((e) => ({
      src: e.attrs['src'] || e.attrs['data-src'] || '',
      alt: e.attrs['alt'],
      hasAlt: 'alt' in e.attrs,
    })),
    jsonLd: jsonLdOf(doc),
    wordCount: doc.text.split(/\s+/).filter(Boolean).length,
    text: doc.text,
  };
}

function headingsOf(doc: Doc): Heading[] {
  return doc.els
    .filter((e) => /^h[1-6]$/.test(e.tag) && !insideAny(e, ['svg', 'template', 'noscript']))
    .map((e) => ({ level: Number(e.tag[1]), text: stripTags(e.text) }))
    .filter((h) => h.text.length > 0);
}

function charsetOf(doc: Doc): string | undefined {
  for (const e of doc.els) {
    if (e.tag === 'meta' && e.attrs['charset']) return e.attrs['charset'];
    if (e.tag === 'meta' && (e.attrs['http-equiv'] || '').toLowerCase() === 'content-type') {
      const m = /charset=([\w-]+)/i.exec(e.attrs['content'] || '');
      if (m) return m[1];
    }
  }
  return undefined;
}

function prefixed(doc: Doc, prefix: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of doc.els) {
    if (e.tag !== 'meta') continue;
    const key = (e.attrs['property'] || e.attrs['name'] || '').toLowerCase();
    if (key.startsWith(prefix) && e.attrs['content'] && !(key in out)) out[key] = e.attrs['content'];
  }
  return out;
}

export function absolutize(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function linksOf(doc: Doc, pageUrl: string, siteOrigin: string): LinkRef[] {
  const originHost = safeHost(siteOrigin);
  return byTagInDocument(doc, 'a').map((e) => {
    const href = e.attrs['href'] || '';
    const absolute = href && !/^(mailto:|tel:|javascript:|#)/i.test(href) ? absolutize(href, pageUrl) : null;
    const rel = (e.attrs['rel'] || '').toLowerCase();
    return {
      href,
      absolute,
      text: stripTags(e.text).slice(0, 160),
      rel,
      internal: !!absolute && safeHost(absolute) === originHost,
      nofollow: rel.split(/\s+/).includes('nofollow'),
    };
  });
}

export function safeHost(u: string): string {
  try {
    return new URL(u).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function jsonLdOf(doc: Doc): JsonLdBlock[] {
  return doc.els
    .filter((e) => e.tag === 'script' && (e.attrs['type'] || '').toLowerCase().includes('ld+json'))
    .map((e) => {
      const raw = e.text.trim();
      try {
        return { raw, parsed: JSON.parse(raw) as unknown };
      } catch (err) {
        return { raw, parsed: null, parseError: err instanceof Error ? err.message : 'invalid JSON' };
      }
    });
}
