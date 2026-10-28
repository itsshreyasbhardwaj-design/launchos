import { describe, expect, it } from 'vitest';
import { parseHtml, byTagInDocument, metaContent, linkHref, decode } from '../src/core/html/parse';
import { extractPage } from '../src/core/audit/extract';
import { runChecks, normalizeForCompare, headingSkips, type SiteContext } from '../src/core/audit/checks';
import { validateJsonLd } from '../src/core/audit/schema-validate';
import { parseRobots, isAllowed, matchRobotsPath, type Robots } from '../src/core/net/robots';
import { detectFramework, fixFor } from '../src/core/audit/fixes';
import { fakePage } from './helpers';

const ctx = (over: Partial<SiteContext> = {}): SiteContext => ({
  origin: 'https://example.com',
  robots: null,
  robotsReachable: true,
  sitemaps: [{ url: 'https://example.com/sitemap.xml', status: 200, kind: 'urlset', urls: ['https://example.com/'], children: [] }],
  sitemapUrls: ['https://example.com/'],
  brokenInternalLinks: [],
  framework: 'static',
  requestedPages: 1,
  ...over,
});

const ids = (fs: { checkId: string }[]): string[] => fs.map((f) => f.checkId);

describe('HTML scanner', () => {
  it('ignores <title> and <h1> inside inline SVG and <template>', () => {
    const html = `<html><head><title>Real title</title></head><body>
      <svg><title>Icon label</title></svg>
      <template><h1>Template heading</h1></template>
      <h1>Real heading</h1></body></html>`;
    const doc = parseHtml(html);
    expect(byTagInDocument(doc, 'title').map((t) => t.text)).toEqual(['Real title']);
    expect(byTagInDocument(doc, 'h1').map((t) => t.text)).toEqual(['Real heading']);
  });

  it('handles unquoted, single-quoted and empty attributes', () => {
    const doc = parseHtml(`<a href=/x class='b c' data-flag>link</a>`);
    const a = doc.els.find((e) => e.tag === 'a')!;
    expect(a.attrs.href).toBe('/x');
    expect(a.attrs.class).toBe('b c');
    expect(a.attrs['data-flag']).toBe('');
  });

  it('does not treat > inside a quoted attribute as the tag end', () => {
    const doc = parseHtml(`<meta name="description" content="a > b and c"><p>body</p>`);
    expect(metaContent(doc, 'description')).toBe('a > b and c');
  });

  it('skips comments, doctype and script bodies in extracted text', () => {
    const doc = parseHtml(`<!doctype html><!-- <h1>hidden</h1> --><script>var x = "<h1>no</h1>";</script><p>Visible text</p>`);
    expect(doc.text).toContain('Visible text');
    expect(doc.text).not.toContain('hidden');
    expect(doc.text).not.toContain('var x');
  });

  it('decodes named and numeric entities', () => {
    expect(decode('a &amp; b &lt;c&gt; &#65; &#x42; &nbsp;d')).toBe('a & b <c> A B  d');
  });

  it('reads rel values case-insensitively and from multi-value rel', () => {
    const doc = parseHtml(`<link REL="Canonical Next" HREF="https://example.com/x">`);
    expect(linkHref(doc, 'canonical')).toBe('https://example.com/x');
  });

  it('survives unclosed tags without throwing', () => {
    expect(() => parseHtml('<div><p>hello<span>world')).not.toThrow();
    expect(() => parseHtml('<a href="')).not.toThrow();
  });
});

describe('page extraction', () => {
  it('treats a non-HTML response as non-HTML and runs no content checks', () => {
    const page = extractPage(fakePage({ contentType: 'application/pdf', body: '%PDF-1.4 ...' }), 'https://example.com');
    expect(page.isHtml).toBe(false);
    const fs = runChecks([page], ctx());
    expect(ids(fs)).not.toContain('title.missing');
  });

  it('reads canonical, og, twitter, hreflang and viewport', () => {
    const body = `<html lang="en-IN"><head>
      <title>Pricing — Example</title>
      <meta name="description" content="What it costs.">
      <link rel="canonical" href="https://example.com/pricing">
      <meta property="og:title" content="Pricing"><meta property="og:image" content="/og.png">
      <meta name="twitter:card" content="summary_large_image">
      <link rel="alternate" hreflang="hi-IN" href="https://example.com/hi/pricing">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      </head><body><h1>Pricing</h1><a href="/docs">Docs</a><img src="/a.png"></body></html>`;
    const p = extractPage(fakePage({ body, finalUrl: 'https://example.com/pricing' }), 'https://example.com');
    expect(p.title).toBe('Pricing — Example');
    expect(p.canonicalAbsolute).toBe('https://example.com/pricing');
    expect(p.og['og:title']).toBe('Pricing');
    expect(p.twitter['twitter:card']).toBe('summary_large_image');
    expect(p.hreflang[0].lang).toBe('hi-IN');
    expect(p.lang).toBe('en-IN');
    expect(p.internalLinks).toContain('https://example.com/docs');
    expect(p.images[0].hasAlt).toBe(false);
  });

  it('detects noindex from both the meta tag and the X-Robots-Tag header', () => {
    const viaMeta = extractPage(fakePage({ body: '<html><head><meta name="robots" content="noindex, follow"></head></html>' }), 'https://example.com');
    expect(viaMeta.noindex).toBe(true);
    const viaHeader = extractPage(
      fakePage({ headers: { 'content-type': 'text/html', 'x-robots-tag': 'noindex' } }),
      'https://example.com'
    );
    expect(viaHeader.noindex).toBe(true);
  });
});

describe('technical SEO checks', () => {
  const page = (body: string, over: Record<string, unknown> = {}) =>
    extractPage(fakePage({ body, ...over }), 'https://example.com');

  it('flags a missing title and offers a framework-appropriate fix', () => {
    const fs = runChecks([page('<html><head></head><body><h1>x</h1></body></html>')], ctx({ framework: 'nextjs' }));
    const f = fs.find((x) => x.checkId === 'title.missing')!;
    expect(f).toBeDefined();
    expect(f.severity).toBe('high');
    expect(f.fixSnippet).toContain('export const metadata');
  });

  it('flags a canonical pointing at a different URL on the same host', () => {
    const p = page('<html><head><title>A title here</title><link rel="canonical" href="https://example.com/other"></head><body><h1>x</h1></body></html>');
    expect(ids(runChecks([p], ctx()))).toContain('canonical.mismatch');
  });

  it('does not flag a self-referencing canonical that differs only by trailing slash', () => {
    const p = page('<html><head><title>A title here</title><link rel="canonical" href="https://example.com"></head><body><h1>x</h1></body></html>');
    expect(ids(runChecks([p], ctx()))).not.toContain('canonical.mismatch');
  });

  it('flags duplicate titles and descriptions across pages', () => {
    const body = '<html><head><title>Same title everywhere</title><meta name="description" content="The same description on both of these pages."></head><body><h1>x</h1></body></html>';
    const a = page(body, { requestedUrl: 'https://example.com/a', finalUrl: 'https://example.com/a' });
    const b = page(body, { requestedUrl: 'https://example.com/b', finalUrl: 'https://example.com/b' });
    const got = ids(runChecks([a, b], ctx()));
    expect(got).toContain('title.duplicate');
    expect(got).toContain('description.duplicate');
  });

  it('flags broken internal links with the referring page in the evidence', () => {
    const fs = runChecks([page('<html><head><title>A title here</title></head><body><h1>x</h1><a href="/gone">g</a></body></html>')],
      ctx({ brokenInternalLinks: [{ from: 'https://example.com/', to: 'https://example.com/gone', status: 404 }] }));
    const f = fs.find((x) => x.checkId === 'links.broken_internal')!;
    expect(f.evidence).toContain('https://example.com/gone');
    expect(f.evidence).toContain('404');
  });

  it('flags a missing sitemap and a missing robots.txt separately', () => {
    const robots: Robots = { fetched: true, status: 404, raw: '', groups: [], sitemaps: [], state: 'missing' };
    const got = ids(runChecks([page('<html><head><title>A title here</title></head><body><h1>x</h1></body></html>')],
      ctx({ robots, sitemaps: [], sitemapUrls: [] })));
    expect(got).toContain('sitemap.missing');
    expect(got).toContain('robots.missing');
  });

  it('flags a page blocked by robots.txt', () => {
    const robots: Robots = {
      fetched: true, status: 200, raw: '', state: 'parsed', sitemaps: [],
      groups: [{ agents: ['*'], rules: [{ allow: false, path: '/private' }] }],
    };
    const p = page('<html><head><title>A title here</title></head><body><h1>x</h1></body></html>',
      { requestedUrl: 'https://example.com/private/x', finalUrl: 'https://example.com/private/x' });
    expect(ids(runChecks([p], ctx({ robots })))).toContain('indexability.robots_blocked');
  });

  it('flags HTTP errors and skips content checks for them', () => {
    const p = page('<html></html>', { status: 500 });
    const got = ids(runChecks([p], ctx()));
    expect(got).toContain('http.error');
    expect(got).not.toContain('title.missing');
  });

  it('flags a redirect chain of two or more hops', () => {
    const p = page('<html><head><title>A title here</title></head><body><h1>x</h1></body></html>', {
      redirectChain: [
        { url: 'https://example.com/a', status: 301, location: 'https://example.com/b' },
        { url: 'https://example.com/b', status: 301, location: 'https://example.com/c' },
      ],
    });
    expect(ids(runChecks([p], ctx()))).toContain('redirect.chain');
  });

  it('reports thin content as possibly client-rendered rather than asserting it is thin', () => {
    const fs = runChecks([page('<html><head><title>A title here</title></head><body><h1>x</h1><div id="root"></div></body></html>')], ctx());
    const f = fs.find((x) => x.checkId === 'content.thin')!;
    expect(f.impactHypothesis).toMatch(/rendered client-side|JavaScript-rendered/i);
  });

  it('scopes the orphan finding to what was actually crawled', () => {
    const p = page('<html><head><title>A title here</title></head><body><h1>x</h1></body></html>',
      { requestedUrl: 'https://example.com/lonely', finalUrl: 'https://example.com/lonely' });
    const fs = runChecks([p], ctx({ sitemapUrls: ['https://example.com/lonely'], requestedPages: 1 }));
    const f = fs.find((x) => x.checkId === 'structure.orphan_candidates');
    expect(f?.evidence).toMatch(/1 page\(s\) crawled of 1 requested/);
  });

  it('every finding carries evidence, an impact hypothesis, a fix and a verification method', () => {
    const fs = runChecks([page('<html><head></head><body></body></html>')], ctx({ robots: null, robotsReachable: false, sitemaps: [], sitemapUrls: [] }));
    expect(fs.length).toBeGreaterThan(3);
    for (const f of fs) {
      expect(f.evidence.length, f.checkId).toBeGreaterThan(5);
      expect(f.impactHypothesis.length, f.checkId).toBeGreaterThan(20);
      expect(f.suggestion.length, f.checkId).toBeGreaterThan(10);
      expect(f.verification.length, f.checkId).toBeGreaterThan(10);
    }
  });

  it('normalizes URLs for comparison without losing meaningful differences', () => {
    expect(normalizeForCompare('https://WWW.Example.com/a/?b=2&a=1#frag')).toBe(normalizeForCompare('https://example.com/a?a=1&b=2'));
    expect(normalizeForCompare('https://example.com/a')).not.toBe(normalizeForCompare('https://example.com/b'));
  });

  it('detects skipped heading levels', () => {
    expect(headingSkips([{ level: 1, text: 'a' }, { level: 3, text: 'b' }])).toHaveLength(1);
    expect(headingSkips([{ level: 1, text: 'a' }, { level: 2, text: 'b' }])).toHaveLength(0);
  });
});

describe('structured data validation', () => {
  it('requires @context and @type', () => {
    expect(validateJsonLd({ name: 'x' }).valid).toBe(false);
    expect(validateJsonLd({ '@context': 'https://schema.org', name: 'x' }).valid).toBe(false);
  });

  it('reports missing required properties per type', () => {
    const r = validateJsonLd({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Example' });
    expect(r.valid).toBe(false);
    expect(r.problems.some((p) => p.property === 'url')).toBe(true);
  });

  it('rejects an aggregateRating with no rating count', () => {
    const r = validateJsonLd({
      '@context': 'https://schema.org', '@type': 'Product', name: 'X',
      aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.9' },
    }, 'Rated 4.9 by our users');
    expect(r.valid).toBe(false);
    expect(r.problems.some((p) => /ratingCount/.test(p.message))).toBe(true);
  });

  it('warns when markup asserts a value the page text does not contain', () => {
    const r = validateJsonLd({
      '@context': 'https://schema.org', '@type': 'Product', name: 'X',
      offers: { '@type': 'Offer', price: '4999', priceCurrency: 'INR' },
    }, 'This page never mentions a price at all.');
    expect(r.problems.some((p) => p.level === 'warning' && p.property === 'offers')).toBe(true);
  });

  it('accepts markup whose claims appear in the page text', () => {
    const r = validateJsonLd({
      '@context': 'https://schema.org', '@type': 'Product', name: 'X',
      offers: { '@type': 'Offer', price: '4999', priceCurrency: 'INR' },
    }, 'Priced at 4999 INR per year.');
    expect(r.problems.some((p) => p.level === 'warning' && p.property === 'offers')).toBe(false);
  });

  it('walks @graph nodes', () => {
    const r = validateJsonLd({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'A', url: 'https://a.example' },
        { '@type': 'WebSite', name: 'A', url: 'https://a.example' },
      ],
    });
    expect(r.types.sort()).toEqual(['Organization', 'WebSite']);
    expect(r.valid).toBe(true);
  });
});

describe('robots.txt', () => {
  it('parses grouped user-agent blocks and sitemaps', () => {
    const r = parseRobots(`
      User-agent: *
      Disallow: /admin
      Allow: /admin/public

      User-agent: GPTBot
      User-agent: CCBot
      Disallow: /

      Sitemap: https://example.com/sitemap.xml
    `);
    expect(r.groups).toHaveLength(2);
    expect(r.groups[1].agents).toEqual(['gptbot', 'ccbot']);
    expect(r.sitemaps).toEqual(['https://example.com/sitemap.xml']);
  });

  it('applies longest-match precedence', () => {
    const robots: Robots = {
      fetched: true, status: 200, raw: '', state: 'parsed', sitemaps: [],
      groups: [{ agents: ['*'], rules: [{ allow: false, path: '/admin' }, { allow: true, path: '/admin/public' }] }],
    };
    expect(isAllowed(robots, '/admin/secret', 'LaunchOS')).toBe(false);
    expect(isAllowed(robots, '/admin/public/page', 'LaunchOS')).toBe(true);
    expect(isAllowed(robots, '/', 'LaunchOS')).toBe(true);
  });

  it('prefers the most specific matching user-agent group', () => {
    const robots: Robots = {
      fetched: true, status: 200, raw: '', state: 'parsed', sitemaps: [],
      groups: [
        { agents: ['*'], rules: [{ allow: true, path: '/' }] },
        { agents: ['launchos-audit'], rules: [{ allow: false, path: '/' }] },
      ],
    };
    expect(isAllowed(robots, '/x', 'LaunchOS-Audit/0.1')).toBe(false);
    expect(isAllowed(robots, '/x', 'SomeOtherBot')).toBe(true);
  });

  it('treats a 5xx robots.txt as disallow-all rather than allow-all', () => {
    const robots: Robots = { fetched: true, status: 503, raw: '', state: 'unknown', groups: [], sitemaps: [] };
    expect(isAllowed(robots, '/anything', 'LaunchOS')).toBe(false);
  });

  it('supports wildcards and end-anchors', () => {
    expect(matchRobotsPath('/*.pdf$', '/docs/a.pdf')).toBe(true);
    expect(matchRobotsPath('/*.pdf$', '/docs/a.pdf?x=1')).toBe(false);
    expect(matchRobotsPath('/a/*/c', '/a/b/c')).toBe(true);
  });
});

describe('framework detection and fixes', () => {
  it('detects Next.js from build markers', () => {
    expect(detectFramework('<script src="/_next/static/x.js"></script>', {})).toBe('nextjs');
    expect(detectFramework('<html><body>plain</body></html>', {})).toBe('static');
  });

  it('produces framework-specific snippets for the same check', () => {
    const next = fixFor('canonical.missing', 'nextjs', { url: 'https://example.com/a' })!;
    const html = fixFor('canonical.missing', 'static', { url: 'https://example.com/a' })!;
    expect(next.snippet).toContain('alternates');
    expect(html.snippet).toContain('<link rel="canonical"');
  });
});
