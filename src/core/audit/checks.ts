import type { PageFacts } from './extract';
import { safeHost } from './extract';
import type { Robots } from '../net/robots';
import type { SitemapResult } from '../net/sitemap';
import { validateJsonLd } from './schema-validate';
import { detectFramework, fixFor, type Framework } from './fixes';
import { groupBy, unique } from '../util';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Finding = {
  checkId: string;
  category: 'indexability' | 'metadata' | 'content' | 'structure' | 'structured_data' | 'performance' | 'internationalization' | 'accessibility' | 'security';
  severity: Severity;
  pageUrl?: string;
  title: string;
  evidence: string;
  impactHypothesis: string;
  suggestion: string;
  complexity: 'trivial' | 'small' | 'medium' | 'large';
  verification: string;
  docsUrl?: string;
  fixSnippet?: string;
  fixLanguage?: string;
};

export type SiteContext = {
  origin: string;
  robots: Robots | null;
  robotsReachable: boolean;
  sitemaps: SitemapResult[];
  sitemapUrls: string[];
  brokenInternalLinks: { from: string; to: string; status: number | string }[];
  framework: Framework;
  requestedPages: number;
};

const DOCS = {
  title: 'https://developers.google.com/search/docs/appearance/title-link',
  desc: 'https://developers.google.com/search/docs/appearance/snippet',
  canonical: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  robotsTxt: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
  robotsMeta: 'https://developers.google.com/search/docs/crawling-indexing/block-indexing',
  sitemap: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview',
  mobile: 'https://developers.google.com/search/docs/appearance/mobile-friendly',
  structured: 'https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data',
  hreflang: 'https://developers.google.com/search/docs/specialty/international/localized-versions',
  alt: 'https://www.w3.org/WAI/tutorials/images/',
  https: 'https://developers.google.com/search/docs/crawling-indexing/https',
  links: 'https://developers.google.com/search/docs/crawling-indexing/links-crawlable',
};

export function runChecks(pages: PageFacts[], ctx: SiteContext): Finding[] {
  const out: Finding[] = [];
  const html = pages.filter((p) => p.isHtml);

  out.push(...siteChecks(pages, ctx));
  for (const p of html) out.push(...pageChecks(p, ctx));
  out.push(...duplicateChecks(html, ctx));
  out.push(...orphanChecks(html, ctx));
  return out;
}

function siteChecks(pages: PageFacts[], ctx: SiteContext): Finding[] {
  const out: Finding[] = [];
  const fw = ctx.framework;

  if (!ctx.robotsReachable) {
    out.push({
      checkId: 'robots.unreachable',
      category: 'indexability',
      severity: 'medium',
      title: 'robots.txt could not be fetched',
      evidence: 'The request for /robots.txt did not complete, so crawl rules are unknown.',
      impactHypothesis:
        'Crawlers that cannot read robots.txt may back off or guess. LaunchOS also could not confirm which paths it is allowed to crawl.',
      suggestion: 'Make /robots.txt return 200 (an empty allow-all file is fine) or 404. Avoid 5xx responses.',
      complexity: 'small',
      verification: 'Open https://<host>/robots.txt in a browser and confirm a 200 or 404 response.',
      docsUrl: DOCS.robotsTxt,
      ...snippet('robots.missing', fw, { origin: ctx.origin }),
    });
  } else if (ctx.robots?.state === 'missing') {
    out.push({
      checkId: 'robots.missing',
      category: 'indexability',
      severity: 'low',
      title: 'No robots.txt published',
      evidence: `GET ${ctx.origin}/robots.txt returned ${ctx.robots.status}.`,
      impactHypothesis:
        'Crawling is still allowed without robots.txt, but you lose the standard place to declare your sitemap.',
      suggestion: 'Publish a minimal robots.txt that allows crawling and points at your sitemap.',
      complexity: 'trivial',
      verification: 'Fetch /robots.txt and confirm it returns 200 with a Sitemap: line.',
      docsUrl: DOCS.robotsTxt,
      ...snippet('robots.missing', fw, { origin: ctx.origin }),
    });
  }

  const hasSitemap = ctx.sitemaps.some((s) => s.kind === 'urlset' || s.kind === 'sitemapindex');
  if (!hasSitemap) {
    out.push({
      checkId: 'sitemap.missing',
      category: 'indexability',
      severity: 'high',
      title: 'No readable XML sitemap found',
      evidence: ctx.sitemaps.length
        ? `Tried ${ctx.sitemaps.length} candidate(s): ${ctx.sitemaps.map((s) => `${s.url} -> ${s.kind}${s.note ? ` (${s.note})` : ''}`).join('; ')}`
        : 'No sitemap was declared in robots.txt and /sitemap.xml was not reachable.',
      impactHypothesis:
        'Without a sitemap, search engines rely entirely on link discovery. New or weakly linked pages take longer to be found.',
      suggestion: 'Publish /sitemap.xml listing your canonical URLs and reference it from robots.txt.',
      complexity: 'small',
      verification: 'Fetch /sitemap.xml, then submit it in Google Search Console and Bing Webmaster Tools.',
      docsUrl: DOCS.sitemap,
      ...snippet('sitemap.missing', fw, { origin: ctx.origin }),
    });
  } else {
    const empty = ctx.sitemaps.filter((s) => s.kind === 'urlset' && s.urls.length === 0);
    if (empty.length) {
      out.push({
        checkId: 'sitemap.empty',
        category: 'indexability',
        severity: 'medium',
        title: 'Sitemap contains no URLs',
        evidence: `Empty <urlset>: ${empty.map((s) => s.url).join(', ')}`,
        impactHypothesis: 'An empty sitemap gives search engines nothing to discover and can look like a broken deployment.',
        suggestion: 'Generate the sitemap from your real route list at build time.',
        complexity: 'small',
        verification: 'Re-fetch the sitemap and count <loc> entries.',
        docsUrl: DOCS.sitemap,
      });
    }
    const errored = ctx.sitemaps.filter((s) => s.kind === 'error');
    if (errored.length) {
      out.push({
        checkId: 'sitemap.error',
        category: 'indexability',
        severity: 'medium',
        title: 'A declared sitemap did not load',
        evidence: errored.map((s) => `${s.url}: ${s.note ?? `HTTP ${s.status}`}`).join('; '),
        impactHypothesis: 'A sitemap referenced in robots.txt that fails to load wastes crawl requests and is reported as an error in Search Console.',
        suggestion: 'Fix or remove the broken sitemap reference.',
        complexity: 'trivial',
        verification: 'Fetch each Sitemap: URL from robots.txt and confirm HTTP 200 and valid XML.',
        docsUrl: DOCS.sitemap,
      });
    }
  }

  const home = pages[0];
  if (home && !home.hasHttps) {
    out.push({
      checkId: 'https.missing',
      category: 'security',
      severity: 'critical',
      title: 'Site is not served over HTTPS',
      evidence: `Final URL after redirects: ${home.finalUrl}`,
      impactHypothesis:
        'HTTPS is a confirmed lightweight ranking signal, browsers mark HTTP pages as not secure, and some directories reject non-HTTPS submissions.',
      suggestion: 'Enable TLS and redirect all HTTP traffic to HTTPS with a 301.',
      complexity: 'small',
      verification: 'Load http://<host> and confirm it 301s to https://<host>.',
      docsUrl: DOCS.https,
      ...snippet('https.missing', fw),
    });
  }

  const broken = ctx.brokenInternalLinks;
  if (broken.length) {
    const byTarget = groupBy(broken, (b) => b.to);
    out.push({
      checkId: 'links.broken_internal',
      category: 'structure',
      severity: broken.length > 5 ? 'high' : 'medium',
      title: `${Object.keys(byTarget).length} internal link target(s) did not return 200`,
      evidence: Object.entries(byTarget)
        .slice(0, 12)
        .map(([to, refs]) => `${to} -> ${refs[0].status} (linked from ${unique(refs.map((r) => r.from)).slice(0, 3).join(', ')})`)
        .join('\n'),
      impactHypothesis: 'Broken internal links waste crawl budget, strand link equity and send visitors to dead ends.',
      suggestion: 'Fix or remove each broken link. If the target moved, update the link rather than relying on a redirect.',
      complexity: 'small',
      verification: 'Re-run the audit; this finding should disappear.',
      docsUrl: DOCS.links,
    });
  }

  return out;
}

function pageChecks(p: PageFacts, ctx: SiteContext): Finding[] {
  const out: Finding[] = [];
  const fw = ctx.framework;
  const base = { pageUrl: p.url };
  const ctxFix = { url: p.finalUrl, origin: ctx.origin, title: p.title ?? '', description: p.metaDescription ?? '' };

  if (p.status >= 400) {
    out.push({
      ...base,
      checkId: 'http.error',
      category: 'indexability',
      severity: p.status >= 500 ? 'critical' : 'high',
      title: `Page returned HTTP ${p.status}`,
      evidence: `GET ${p.url} -> ${p.status} (${p.contentType || 'no content-type'})`,
      impactHypothesis: 'Error responses cannot rank, cannot be cited by AI answer engines and break any link pointing at them.',
      suggestion: p.status >= 500 ? 'Investigate the server error; 5xx responses also slow crawling of the whole site.' : 'Restore the page or return a 301 to its replacement.',
      complexity: 'medium',
      verification: `Re-request ${p.url} and confirm a 200 response.`,
    });
    return out;
  }

  if (p.redirectChain.length >= 2) {
    out.push({
      ...base,
      checkId: 'redirect.chain',
      category: 'indexability',
      severity: 'medium',
      title: `Redirect chain of ${p.redirectChain.length} hops`,
      evidence: [p.url, ...p.redirectChain.map((h) => `${h.status} -> ${h.location}`)].join('\n'),
      impactHypothesis: 'Each extra hop adds latency and some crawlers stop following long chains.',
      suggestion: 'Point the first URL straight at the final destination.',
      complexity: 'small',
      verification: 'curl -IL the original URL and count the 3xx responses.',
      docsUrl: DOCS.canonical,
      ...snippet('redirect.chain', fw, { chain: [p.url, ...p.redirectChain.map((h) => h.location)].join(' -> ') }),
    });
  }

  if (!p.isHtml) return out;

  if (p.noindex) {
    out.push({
      ...base,
      checkId: 'indexability.noindex',
      category: 'indexability',
      severity: 'high',
      title: 'Page declares noindex',
      evidence: `meta robots: ${p.metaRobots ?? '(none)'} | X-Robots-Tag: ${p.xRobotsTag ?? '(none)'}`,
      impactHypothesis:
        'A noindex directive removes the page from search results. On a page you want found this is usually a leftover from staging.',
      suggestion: 'Remove the noindex directive from pages that should be indexable.',
      complexity: 'trivial',
      verification: 'Fetch the page and confirm no noindex appears in the meta robots tag or X-Robots-Tag header.',
      docsUrl: DOCS.robotsMeta,
    });
  }

  if (ctx.robots?.state === 'parsed') {
    const path = pathOf(p.finalUrl);
    const allowed = isPathAllowed(ctx.robots, path);
    if (!allowed) {
      out.push({
        ...base,
        checkId: 'indexability.robots_blocked',
        category: 'indexability',
        severity: 'high',
        title: 'robots.txt disallows this path for all crawlers',
        evidence: `Path ${path} matches a Disallow rule in robots.txt.`,
        impactHypothesis: 'A disallowed page is not crawled, so its content cannot be indexed or cited.',
        suggestion: 'Narrow the Disallow rule so it only covers paths you genuinely want excluded.',
        complexity: 'small',
        verification: 'Use the robots.txt tester in Search Console on this exact path.',
        docsUrl: DOCS.robotsTxt,
      });
    }
  }

  if (!p.title) {
    out.push({
      ...base,
      checkId: 'title.missing',
      category: 'metadata',
      severity: 'high',
      title: 'Page has no <title>',
      evidence: 'No non-empty <title> element was found in the HTML response.',
      impactHypothesis:
        'The title is the strongest on-page relevance signal and the clickable line in results. Search engines will invent one from page text instead.',
      suggestion: 'Add a unique title: primary topic first, brand last, roughly 50-60 characters.',
      complexity: 'trivial',
      verification: 'View source and confirm exactly one <title> element with meaningful text.',
      docsUrl: DOCS.title,
      ...snippet('title.missing', fw, ctxFix),
    });
  } else {
    if (p.titleCount > 1) {
      out.push({
        ...base,
        checkId: 'title.duplicate_tag',
        category: 'metadata',
        severity: 'medium',
        title: `${p.titleCount} <title> elements on one page`,
        evidence: `First title: "${p.title}"`,
        impactHypothesis: 'Multiple titles are ambiguous; which one is used is up to the parser.',
        suggestion: 'Render exactly one <title> element.',
        complexity: 'small',
        verification: 'Count <title> occurrences in the served HTML.',
        docsUrl: DOCS.title,
      });
    }
    const len = p.title.length;
    if (len < 15 || len > 65) {
      out.push({
        ...base,
        checkId: 'title.length',
        category: 'metadata',
        severity: 'low',
        title: len < 15 ? `Title is very short (${len} chars)` : `Title is long (${len} chars) and will likely be truncated`,
        evidence: `"${p.title}" (${len} characters)`,
        impactHypothesis:
          len < 15
            ? 'A very short title leaves out terms a searcher would use, reducing the chance of matching their query.'
            : 'Google truncates titles at roughly 580px (about 60 characters), so the tail is usually not shown.',
        suggestion: 'Aim for 50-60 characters with the distinguishing term first.',
        complexity: 'trivial',
        verification: 'Measure the rendered title length and preview it in Search Console.',
        docsUrl: DOCS.title,
        ...snippet('title.length', fw, ctxFix),
      });
    }
  }

  if (!p.metaDescription) {
    out.push({
      ...base,
      checkId: 'description.missing',
      category: 'metadata',
      severity: 'medium',
      title: 'No meta description',
      evidence: 'No <meta name="description"> with content was found.',
      impactHypothesis:
        'Meta description is not a ranking factor, but it is the snippet people read before deciding to click. Without it the engine picks an arbitrary sentence.',
      suggestion: 'Write a 120-155 character description that states what the page offers and why to click.',
      complexity: 'trivial',
      verification: 'Confirm the tag is present and check how the snippet renders in a SERP preview.',
      docsUrl: DOCS.desc,
      ...snippet('description.missing', fw, ctxFix),
    });
  } else if (p.metaDescription.length > 165 || p.metaDescription.length < 50) {
    out.push({
      ...base,
      checkId: 'description.length',
      category: 'metadata',
      severity: 'low',
      title: `Meta description is ${p.metaDescription.length} characters`,
      evidence: `"${p.metaDescription.slice(0, 180)}"`,
      impactHypothesis: 'Very short descriptions waste the snippet; very long ones get cut mid-sentence.',
      suggestion: 'Target 120-155 characters.',
      complexity: 'trivial',
      verification: 'Re-measure after the change.',
      docsUrl: DOCS.desc,
      ...snippet('description.length', fw, ctxFix),
    });
  }

  if (!p.canonical) {
    out.push({
      ...base,
      checkId: 'canonical.missing',
      category: 'indexability',
      severity: 'medium',
      title: 'No canonical URL declared',
      evidence: 'No <link rel="canonical"> found.',
      impactHypothesis:
        'Without a canonical, query strings and trailing-slash variants can be treated as separate pages, splitting signals between duplicates.',
      suggestion: 'Declare a self-referencing absolute canonical URL on every indexable page.',
      complexity: 'small',
      verification: 'Confirm the canonical matches the URL you want indexed, absolute and HTTPS.',
      docsUrl: DOCS.canonical,
      ...snippet('canonical.missing', fw, ctxFix),
    });
  } else if (p.canonicalAbsolute) {
    const a = normalizeForCompare(p.canonicalAbsolute);
    const b = normalizeForCompare(p.finalUrl);
    if (a !== b && safeHost(p.canonicalAbsolute) === safeHost(p.finalUrl)) {
      out.push({
        ...base,
        checkId: 'canonical.mismatch',
        category: 'indexability',
        severity: 'medium',
        title: 'Canonical points at a different URL on the same host',
        evidence: `Page: ${p.finalUrl}\nCanonical: ${p.canonicalAbsolute}`,
        impactHypothesis:
          'This tells search engines to index the other URL instead. Intentional for duplicates; a real problem when it is a copy-paste leftover.',
        suggestion: 'Use a self-referencing canonical unless this page is deliberately a duplicate.',
        complexity: 'small',
        verification: 'Check the URL Inspection tool in Search Console for the Google-selected canonical.',
        docsUrl: DOCS.canonical,
        ...snippet('canonical.mismatch', fw, ctxFix),
      });
    }
  }

  if (!p.viewport) {
    out.push({
      ...base,
      checkId: 'viewport.missing',
      category: 'performance',
      severity: 'high',
      title: 'No mobile viewport meta tag',
      evidence: 'No <meta name="viewport"> was found.',
      impactHypothesis:
        'Google indexes with a mobile crawler. Without a viewport, mobile browsers render at desktop width and zoom out, which hurts usability and conversion.',
      suggestion: 'Add width=device-width, initial-scale=1.',
      complexity: 'trivial',
      verification: 'Load the page on a phone-sized viewport and confirm no horizontal scrolling.',
      docsUrl: DOCS.mobile,
      ...snippet('viewport.missing', fw),
    });
  }

  if (!p.h1.length) {
    out.push({
      ...base,
      checkId: 'h1.missing',
      category: 'content',
      severity: 'medium',
      title: 'No <h1> heading',
      evidence: `Headings found: ${p.headings.map((h) => `h${h.level}`).join(', ') || 'none'}`,
      impactHypothesis: 'The h1 states what the page is about for both readers and assistive technology, and anchors the heading outline.',
      suggestion: 'Add one descriptive h1 that matches the page intent.',
      complexity: 'trivial',
      verification: 'Confirm exactly one h1 in the rendered DOM.',
      ...snippet('h1.missing', fw, { h1: p.title ?? '' }),
    });
  } else if (p.h1.length > 2) {
    out.push({
      ...base,
      checkId: 'h1.multiple',
      category: 'content',
      severity: 'low',
      title: `${p.h1.length} <h1> headings on one page`,
      evidence: p.h1.slice(0, 5).map((h) => `- ${h}`).join('\n'),
      impactHypothesis: 'Valid HTML, but several competing top-level headings make the page topic ambiguous to readers and to extraction.',
      suggestion: 'Keep one h1 and demote the rest to h2.',
      complexity: 'trivial',
      verification: 'Count h1 elements in the rendered DOM.',
    });
  }

  const skips = headingSkips(p.headings);
  if (skips.length) {
    out.push({
      ...base,
      checkId: 'headings.skipped_level',
      category: 'accessibility',
      severity: 'low',
      title: 'Heading levels skip a level',
      evidence: skips.slice(0, 5).map((s) => `h${s.from} -> h${s.to}: "${s.text}"`).join('\n'),
      impactHypothesis: 'Screen-reader users navigate by heading level; gaps make the document outline misleading.',
      suggestion: 'Use heading levels in order and style them with CSS instead of picking a level for its size.',
      complexity: 'small',
      verification: 'Walk the heading outline with a screen reader or an accessibility inspector.',
    });
  }

  if (!p.lang) {
    out.push({
      ...base,
      checkId: 'lang.missing',
      category: 'internationalization',
      severity: 'low',
      title: 'No lang attribute on <html>',
      evidence: 'The <html> element has no lang attribute.',
      impactHypothesis: 'Screen readers choose a pronunciation from the declared language, and translation tools use it as a hint.',
      suggestion: 'Set lang to the page language, e.g. lang="en" or lang="en-IN".',
      complexity: 'trivial',
      verification: 'Inspect the <html> element.',
      ...snippet('lang.missing', fw, { lang: 'en' }),
    });
  }

  const missingOg = ['og:title', 'og:description', 'og:image'].filter((k) => !p.og[k]);
  if (missingOg.length) {
    out.push({
      ...base,
      checkId: 'og.missing',
      category: 'metadata',
      severity: 'low',
      title: `Open Graph tags incomplete (${missingOg.join(', ')} missing)`,
      evidence: `Present: ${Object.keys(p.og).join(', ') || 'none'}`,
      impactHypothesis: 'Links shared to chat apps and social platforms render without a preview card, which measurably lowers click-through.',
      suggestion: 'Add og:title, og:description, og:url and a 1200x630 og:image.',
      complexity: 'small',
      verification: 'Paste the URL into a social share debugger and confirm the card renders.',
      ...snippet('og.missing', fw, ctxFix),
    });
  }

  if (!p.twitter['twitter:card']) {
    out.push({
      ...base,
      checkId: 'twitter.missing',
      category: 'metadata',
      severity: 'info',
      title: 'No twitter:card metadata',
      evidence: `Present: ${Object.keys(p.twitter).join(', ') || 'none'}`,
      impactHypothesis: 'X/Twitter falls back to Open Graph, so this is cosmetic, but summary_large_image gives a bigger preview.',
      suggestion: 'Add twitter:card=summary_large_image plus title, description and image.',
      complexity: 'trivial',
      verification: 'Check the rendered card after sharing.',
      ...snippet('twitter.missing', fw, ctxFix),
    });
  }

  const noAlt = p.images.filter((i) => !i.hasAlt);
  if (noAlt.length) {
    out.push({
      ...base,
      checkId: 'image.alt',
      category: 'accessibility',
      severity: noAlt.length > 5 ? 'medium' : 'low',
      title: `${noAlt.length} of ${p.images.length} images have no alt attribute`,
      evidence: noAlt.slice(0, 8).map((i) => `- ${i.src || '(no src)'}`).join('\n'),
      impactHypothesis:
        'Images without alt text are invisible to screen readers and to image search. Decorative images need alt="" to be skipped correctly.',
      suggestion: 'Describe informative images; give decorative images an empty alt.',
      complexity: 'small',
      verification: 'Re-run the audit, or check with an accessibility inspector.',
      docsUrl: DOCS.alt,
      ...snippet('image.alt', fw, { src: noAlt[0]?.src ?? '' }),
    });
  }

  if (p.wordCount < 120 && p.status === 200) {
    out.push({
      ...base,
      checkId: 'content.thin',
      category: 'content',
      severity: 'medium',
      title: `Only ${p.wordCount} words of text in the HTML response`,
      evidence: `Extracted text length: ${p.wordCount} words, ${p.bytes} bytes of HTML.`,
      impactHypothesis:
        'Either the page is genuinely thin, or its content is rendered client-side. LaunchOS reads the HTML response only, so JavaScript-rendered text is not counted — both cases limit what non-rendering crawlers and AI answer engines can extract.',
      suggestion:
        'Confirm whether the content is server-rendered. If it is client-only, add server-side rendering or static generation for this route. If the page really is thin, expand it or remove it from the sitemap.',
      complexity: 'medium',
      verification: 'curl the URL and read the response body, or use the URL Inspection tool to see the crawled HTML.',
    });
  }

  const internalCount = p.internalLinks.length;
  if (internalCount === 0) {
    out.push({
      ...base,
      checkId: 'links.no_internal',
      category: 'structure',
      severity: 'medium',
      title: 'Page has no crawlable internal links',
      evidence: `${p.links.length} <a> elements found, none resolving to ${safeHost(ctx.origin)}.`,
      impactHypothesis: 'A page with no outgoing internal links is a dead end for crawlers and passes no signals onward.',
      suggestion: 'Add contextual links to related pages. Use real <a href> elements, not click handlers.',
      complexity: 'small',
      verification: 'Confirm anchors with href attributes exist in the HTML response.',
      docsUrl: DOCS.links,
    });
  }

  const jsLinks = p.links.filter((l) => l.href && /^javascript:/i.test(l.href)).length;
  if (jsLinks > 2) {
    out.push({
      ...base,
      checkId: 'links.not_crawlable',
      category: 'structure',
      severity: 'low',
      title: `${jsLinks} links use javascript: URLs`,
      evidence: p.links.filter((l) => /^javascript:/i.test(l.href)).slice(0, 5).map((l) => `- ${l.text || '(no text)'}: ${l.href}`).join('\n'),
      impactHypothesis: 'Crawlers do not follow javascript: links, so those destinations are only discoverable elsewhere.',
      suggestion: 'Use <a href="/real/path"> and attach behaviour on top of it.',
      complexity: 'small',
      verification: 'Check that each navigational element has a real href.',
      docsUrl: DOCS.links,
    });
  }

  for (const block of p.jsonLd) {
    if (block.parseError) {
      out.push({
        ...base,
        checkId: 'structured_data.invalid_json',
        category: 'structured_data',
        severity: 'medium',
        title: 'JSON-LD block does not parse',
        evidence: `${block.parseError}\nFirst 200 chars: ${block.raw.slice(0, 200)}`,
        impactHypothesis: 'Malformed structured data is ignored entirely, so any rich-result eligibility is lost.',
        suggestion: 'Serialize JSON-LD with JSON.stringify rather than hand-writing it, and validate before shipping.',
        complexity: 'small',
        verification: 'Run the page through Google Rich Results Test and Schema Markup Validator.',
        docsUrl: DOCS.structured,
      });
      continue;
    }
    const v = validateJsonLd(block.parsed, p.text);
    const errors = v.problems.filter((x) => x.level === 'error');
    const warnings = v.problems.filter((x) => x.level === 'warning');
    if (errors.length) {
      out.push({
        ...base,
        checkId: 'structured_data.incomplete',
        category: 'structured_data',
        severity: 'medium',
        title: `Structured data problems in ${v.types.join(', ') || 'untyped block'}`,
        evidence: errors.map((e) => `- ${e.message}`).join('\n'),
        impactHypothesis: 'Types missing required properties are not eligible for the rich results they are meant to unlock.',
        suggestion: 'Add the missing properties using values the page actually displays.',
        complexity: 'small',
        verification: 'Google Rich Results Test should report no errors for this URL.',
        docsUrl: DOCS.structured,
      });
    }
    if (warnings.length) {
      out.push({
        ...base,
        checkId: 'structured_data.unsupported_claim',
        category: 'structured_data',
        severity: 'high',
        title: 'Structured data asserts values not visible on the page',
        evidence: warnings.map((e) => `- ${e.message}`).join('\n'),
        impactHypothesis:
          'Markup that does not match visible content violates Google structured data guidelines and risks a manual action. It is also simply inaccurate.',
        suggestion: 'Either show the value on the page or remove the property from the markup.',
        complexity: 'small',
        verification: 'Compare each marked-up value against the rendered page.',
        docsUrl: 'https://developers.google.com/search/docs/appearance/structured-data/sd-policies',
      });
    }
  }

  if (p.hreflang.length) {
    const noSelf = !p.hreflang.some((h) => normalizeForCompare(h.href) === normalizeForCompare(p.finalUrl));
    if (noSelf) {
      out.push({
        ...base,
        checkId: 'hreflang.no_self_reference',
        category: 'internationalization',
        severity: 'low',
        title: 'hreflang set has no self-referencing entry',
        evidence: p.hreflang.map((h) => `${h.lang} -> ${h.href}`).join('\n'),
        impactHypothesis: 'hreflang annotations must be reciprocal and include the page itself, or the whole set may be ignored.',
        suggestion: 'Add an hreflang entry pointing at this page, and mirror the full set on every alternate.',
        complexity: 'small',
        verification: 'Use the international targeting report or an hreflang validator.',
        docsUrl: DOCS.hreflang,
      });
    }
  }

  return out;
}

function duplicateChecks(pages: PageFacts[], ctx: SiteContext): Finding[] {
  const out: Finding[] = [];
  const dupe = (key: 'title' | 'metaDescription', checkId: string, label: string): void => {
    const groups = new Map<string, string[]>();
    for (const p of pages) {
      const v = (p[key] || '').trim().toLowerCase();
      if (!v) continue;
      const arr = groups.get(v) ?? [];
      arr.push(p.url);
      groups.set(v, arr);
    }
    const dupes = [...groups.entries()].filter(([, urls]) => urls.length > 1);
    if (!dupes.length) return;
    out.push({
      checkId,
      category: 'metadata',
      severity: 'medium',
      title: `${dupes.length} duplicate ${label}(s) across crawled pages`,
      evidence: dupes
        .slice(0, 6)
        .map(([v, urls]) => `"${v.slice(0, 70)}" on ${urls.length} pages: ${urls.slice(0, 4).join(', ')}`)
        .join('\n'),
      impactHypothesis: `Identical ${label}s make pages look interchangeable, so search engines may pick one and ignore the rest.`,
      suggestion: `Give each page a ${label} that names what is unique about it.`,
      complexity: 'small',
      verification: 'Re-run the audit, or check the duplicate-metadata report in your crawler of choice.',
      docsUrl: key === 'title' ? DOCS.title : DOCS.desc,
    });
  };
  dupe('title', 'title.duplicate', 'title');
  dupe('metaDescription', 'description.duplicate', 'meta description');
  return out;
}

function orphanChecks(pages: PageFacts[], ctx: SiteContext): Finding[] {
  if (!ctx.sitemapUrls.length) return [];
  const linked = new Set<string>();
  for (const p of pages) for (const l of p.internalLinks) linked.add(normalizeForCompare(l));
  const crawled = new Set(pages.map((p) => normalizeForCompare(p.finalUrl)));
  const orphans = ctx.sitemapUrls
    .filter((u) => crawled.has(normalizeForCompare(u)) && !linked.has(normalizeForCompare(u)))
    .filter((u) => normalizeForCompare(u) !== normalizeForCompare(ctx.origin));
  if (!orphans.length) return [];
  return [
    {
      checkId: 'structure.orphan_candidates',
      category: 'structure',
      severity: 'low',
      title: `${orphans.length} sitemap URL(s) were not linked from any crawled page`,
      evidence:
        orphans.slice(0, 10).map((u) => `- ${u}`).join('\n') +
        `\n\nScope: ${pages.length} page(s) crawled of ${ctx.requestedPages} requested. A page linked only from an uncrawled page will appear here.`,
      impactHypothesis: 'Pages reachable only through the sitemap get little internal link signal and are often weakly indexed.',
      suggestion: 'Link these pages from relevant parent pages, navigation or related-content blocks.',
      complexity: 'small',
      verification: 'Confirm at least one internal link points at each URL, then re-crawl.',
      docsUrl: DOCS.links,
    },
  ];
}

function snippet(checkId: string, fw: Framework, ctx: Record<string, string> = {}): { fixSnippet?: string; fixLanguage?: string } {
  const f = fixFor(checkId, fw, ctx);
  return f ? { fixSnippet: f.snippet, fixLanguage: f.language } : {};
}

export function headingSkips(hs: { level: number; text: string }[]): { from: number; to: number; text: string }[] {
  const out: { from: number; to: number; text: string }[] = [];
  let prev = 0;
  for (const h of hs) {
    if (prev && h.level > prev + 1) out.push({ from: prev, to: h.level, text: h.text.slice(0, 60) });
    prev = h.level;
  }
  return out;
}

export function normalizeForCompare(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    x.host = x.host.toLowerCase().replace(/^www\./, '');
    const p = x.pathname.replace(/\/+$/, '');
    x.pathname = p === '' ? '/' : p;
    x.searchParams.sort();
    return x.toString();
  } catch {
    return u;
  }
}

function pathOf(u: string): string {
  try {
    const x = new URL(u);
    return x.pathname + (x.search || '');
  } catch {
    return '/';
  }
}

function isPathAllowed(robots: Robots, path: string): boolean {
  // Re-implemented locally against the '*' group so this stays pure/testable.
  const star = robots.groups.filter((g) => g.agents.includes('*'));
  let best: { len: number; allow: boolean } | null = null;
  for (const g of star) {
    for (const r of g.rules) {
      if (!r.path) continue;
      const anchored = r.path.endsWith('$');
      const body = anchored ? r.path.slice(0, -1) : r.path;
      const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
      if (!re.test(path)) continue;
      const len = body.replace(/\*/g, '').length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

export { detectFramework };
