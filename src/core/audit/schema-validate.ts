/**
 * Schema.org JSON-LD validation.
 *
 * This is a *structural* validator: it checks that blocks parse, declare
 * @context / @type, carry the properties each type needs to be useful, and do
 * not claim things LaunchOS cannot see evidence for. It is not an affiliation
 * of, or a substitute for, Google's Rich Results Test — run that too.
 */
export type SchemaProblem = { level: 'error' | 'warning' | 'info'; message: string; property?: string };
export type SchemaCheck = { types: string[]; valid: boolean; problems: SchemaProblem[] };

const REQUIRED: Record<string, string[]> = {
  Organization: ['name', 'url'],
  LocalBusiness: ['name', 'address'],
  SoftwareApplication: ['name', 'applicationCategory'],
  WebApplication: ['name', 'applicationCategory'],
  MobileApplication: ['name', 'applicationCategory'],
  Product: ['name'],
  Article: ['headline'],
  BlogPosting: ['headline'],
  NewsArticle: ['headline'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  WebSite: ['name', 'url'],
  Person: ['name'],
};

const RECOMMENDED: Record<string, string[]> = {
  Organization: ['logo', 'sameAs', 'description'],
  SoftwareApplication: ['operatingSystem', 'offers', 'description'],
  WebApplication: ['operatingSystem', 'offers', 'description'],
  Article: ['author', 'datePublished', 'image'],
  LocalBusiness: ['telephone', 'openingHoursSpecification', 'url'],
  Product: ['description', 'image'],
};

/** Properties that assert social proof or commercial facts a page must actually have. */
const EVIDENCE_REQUIRED = ['aggregateRating', 'review', 'offers', 'priceRange', 'address', 'geo'];

export function validateJsonLd(parsed: unknown, pageText = ''): SchemaCheck {
  const problems: SchemaProblem[] = [];
  const types: string[] = [];
  const nodes = flatten(parsed);

  if (!nodes.length) {
    return { types, valid: false, problems: [{ level: 'error', message: 'JSON-LD block contains no object nodes.' }] };
  }

  for (const { node, context } of nodes) {
    const ctx = node['@context'] ?? context;
    if (!ctx) problems.push({ level: 'error', message: 'Missing @context (expected "https://schema.org").', property: '@context' });
    else if (!JSON.stringify(ctx).toLowerCase().includes('schema.org')) {
      problems.push({ level: 'warning', message: `@context does not reference schema.org: ${JSON.stringify(ctx).slice(0, 80)}`, property: '@context' });
    }

    const t = node['@type'];
    const nodeTypes = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
    if (!nodeTypes.length) {
      // A node that only wraps an @graph is a container, not an entity; the
      // typed entities inside it are validated as their own nodes.
      const isGraphContainer = Array.isArray(node['@graph']) && (node['@graph'] as unknown[]).length > 0;
      if (!isGraphContainer) problems.push({ level: 'error', message: 'Missing @type.', property: '@type' });
      continue;
    }
    types.push(...nodeTypes);

    for (const type of nodeTypes) {
      for (const req of REQUIRED[type] ?? []) {
        if (isEmpty(node[req])) {
          problems.push({ level: 'error', message: `${type} is missing required property "${req}".`, property: req });
        }
      }
      for (const rec of RECOMMENDED[type] ?? []) {
        if (isEmpty(node[rec])) {
          problems.push({ level: 'info', message: `${type} could add recommended property "${rec}".`, property: rec });
        }
      }
    }

    for (const prop of EVIDENCE_REQUIRED) {
      if (isEmpty(node[prop])) continue;
      const claim = extractClaim(node[prop]);
      if (claim && pageText && !pageTextSupports(pageText, claim)) {
        problems.push({
          level: 'warning',
          property: prop,
          message:
            `"${prop}" asserts ${JSON.stringify(claim).slice(0, 60)} but LaunchOS could not find that ` +
            'value in the visible page text. Structured data must reflect what the page actually shows.',
        });
      }
    }

    if (!isEmpty(node['aggregateRating'])) {
      const ar = node['aggregateRating'] as Record<string, unknown>;
      const count = Number(ar?.['ratingCount'] ?? ar?.['reviewCount'] ?? 0);
      if (!count) {
        problems.push({
          level: 'error',
          property: 'aggregateRating',
          message: 'aggregateRating without a ratingCount/reviewCount. Do not publish ratings you cannot evidence.',
        });
      }
    }
  }

  return { types: [...new Set(types)], valid: !problems.some((p) => p.level === 'error'), problems };
}

type FlatNode = { node: Record<string, unknown>; context: unknown };

/** Flattens nested nodes, carrying @context down into @graph children — inside
 *  a graph the context is inherited, so an inner node without one is valid. */
function flatten(v: unknown, out: FlatNode[] = [], context: unknown = undefined): FlatNode[] {
  if (Array.isArray(v)) {
    for (const x of v) flatten(x, out, context);
    return out;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const inherited = o['@context'] ?? context;
    out.push({ node: o, context: inherited });
    if (Array.isArray(o['@graph'])) for (const x of o['@graph'] as unknown[]) flatten(x, out, inherited);
  }
  return out;
}

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

function extractClaim(v: unknown): string | number | null {
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['price', 'ratingValue', 'priceRange', 'streetAddress', 'telephone']) {
      const x = o[k];
      if (typeof x === 'string' || typeof x === 'number') return x;
    }
  }
  return null;
}

function pageTextSupports(pageText: string, claim: string | number): boolean {
  const needle = String(claim).trim();
  if (needle.length < 2) return true;
  const hay = pageText.toLowerCase();
  if (hay.includes(needle.toLowerCase())) return true;
  const digits = needle.replace(/[^\d.]/g, '');
  return digits.length >= 2 && hay.includes(digits);
}
