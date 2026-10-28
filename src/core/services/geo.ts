import { j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, today, unique, type Result } from '../util';
import { getBrand, getProject, type BrandProfile, type Project } from './projects';
import { latestAudit } from './audits';
import { safeFetch } from '../net/safe-fetch';
import { parseHtml, stripTags } from '../html/parse';

/**
 * GEO = Generative Engine Optimization. AEO = Answer Engine Optimization.
 *
 * What this module does: measures whether a site states, in crawlable text,
 * the things an answer engine would need in order to describe or recommend it
 * accurately; checks that the brand's facts agree across the public records it
 * controls; and records dated, sourced observations of real AI answers.
 *
 * What it does NOT do: predict AI rankings, promise inclusion in AI answers,
 * scrape AI provider interfaces, or report a sampled answer as reproducible.
 */

export type GeoCheck = {
  id: string;
  requirement: string;
  status: 'pass' | 'fail' | 'unknown';
  evidence: string;
  why: string;
  fix: string;
};

export type GeoAudit = {
  project: string;
  pagesExamined: number;
  checks: GeoCheck[];
  score: { passed: number; failed: number; unknown: number; total: number };
  caveat: string;
};

export function geoAudit(d: Db, projectId: string): Result<GeoAudit> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const brand = getBrand(d, projectId);
  const audit = latestAudit(d, projectId);
  if (!audit) return err('GEO analysis needs crawled pages; run "launchos audit" first');

  const pages = d.all<Record<string, unknown>>(
    'SELECT * FROM audit_pages WHERE audit_id = ? AND status_code < 400', audit.id
  );
  const allText = pages.map((p) => `${p.title ?? ''} ${p.meta_description ?? ''}`).join(' ').toLowerCase();
  const sd = d.all<{ schema_type: string | null; valid: number }>('SELECT schema_type, valid FROM structured_data_results WHERE audit_id = ?', audit.id);
  const checks: GeoCheck[] = [];

  const add = (c: GeoCheck): void => void checks.push(c);
  const brandName = brand?.brandName ?? project.name;

  // 1. Clear product identity in crawlable text
  const identityPages = pages.filter((p) => {
    const t = `${p.title ?? ''} ${p.meta_description ?? ''}`.toLowerCase();
    return t.includes(brandName.toLowerCase());
  });
  add({
    id: 'identity.brand_in_metadata',
    requirement: 'The brand name appears in page titles or descriptions',
    status: identityPages.length ? 'pass' : 'fail',
    evidence: `${identityPages.length} of ${pages.length} crawled pages mention "${brandName}" in the title or meta description.`,
    why: 'Answer engines extract entity names from crawlable metadata. If the brand name never appears there, the site is hard to attribute to the brand.',
    fix: 'Include the brand name in titles (usually as a suffix) and in the homepage description.',
  });

  // 2. A page that states what the product is, in plain language
  const explainer = pages.find((p) => {
    const t = `${p.title ?? ''}`.toLowerCase();
    return /\b(what is|about|overview|docs|documentation|features)\b/.test(t);
  });
  add({
    id: 'identity.explainer_page',
    requirement: 'A crawlable page explains what the product is and who it is for',
    status: explainer ? 'pass' : 'unknown',
    evidence: explainer ? `Found "${explainer.title}" at ${explainer.final_url}.` : 'No crawled page title suggested an about, overview, features or documentation page.',
    why: 'Generative engines quote explanatory prose. A product with no plain-language explanation gets described from inference, which is where inaccuracies come from.',
    fix: 'Publish an "About" or "What is X" page that answers, in text, what it does, who it is for, and what it costs.',
  });

  // 3. Thin-content / client-side-rendering risk
  const thin = pages.filter((p) => Number(p.word_count ?? 0) < 120);
  add({
    id: 'extractability.server_rendered_text',
    requirement: 'Page content is present in the HTML response, not only after JavaScript runs',
    status: thin.length === 0 ? 'pass' : thin.length >= pages.length / 2 ? 'fail' : 'unknown',
    evidence: `${thin.length} of ${pages.length} crawled pages returned fewer than 120 words of text in the raw HTML. Examples: ${thin.slice(0, 3).map((p) => `${p.final_url} (${p.word_count}w)`).join(', ') || 'none'}`,
    why: 'Many AI crawlers do not execute JavaScript. Text that only appears after hydration is invisible to them even though a browser shows it.',
    fix: 'Server-render or statically generate the text content of pages you want quoted.',
  });

  // 4. Pricing stated publicly
  const pricingPage = pages.find((p) => /pricing|plans|cost/i.test(String(p.final_url)) || /pricing|plans/i.test(String(p.title ?? '')));
  add({
    id: 'facts.public_pricing',
    requirement: 'Pricing is stated on a public page',
    status: pricingPage ? 'pass' : brand?.pricingModel ? 'unknown' : 'fail',
    evidence: pricingPage
      ? `Found ${pricingPage.final_url}.`
      : brand?.pricingModel
        ? `No pricing page was crawled, but the brand profile records the model "${brand.pricingModel}". It may exist on an uncrawled page.`
        : 'No pricing page was crawled and no pricing is recorded on the brand profile.',
    why: '"How much does X cost" is one of the most common assistant questions. With no public answer, assistants either omit the product or repeat a third party\'s stale figure.',
    fix: 'Publish pricing (or an explicit "free and open source" statement) as crawlable text, not inside an image or a gated flow.',
  });

  // 5. FAQ-style content answering real questions
  const faq = pages.find((p) => /faq|questions|help/i.test(String(p.final_url) + String(p.title ?? '')));
  const faqSchema = sd.some((s) => (s.schema_type ?? '').includes('FAQPage'));
  add({
    id: 'answers.faq_content',
    requirement: 'The site answers common questions in question-and-answer form',
    status: faq || faqSchema ? 'pass' : 'fail',
    evidence: faq ? `Found ${faq.final_url}.` : faqSchema ? 'FAQPage structured data detected.' : 'No FAQ or help page was found in the crawl.',
    why: 'Answer engines match a user question to text shaped like an answer. Question headings with direct answers underneath are the most extractable format there is.',
    fix: 'Add an FAQ section using real questions you receive, with a complete answer in the first sentence under each heading.',
  });

  // 6. Structured data describing the entity
  const entityTypes = unique(sd.flatMap((s) => (s.schema_type ?? '').split(',')).filter(Boolean));
  const hasEntitySchema = entityTypes.some((t) => /Organization|SoftwareApplication|WebApplication|LocalBusiness|Product|WebSite/.test(t));
  add({
    id: 'facts.entity_structured_data',
    requirement: 'Structured data identifies the organization or product',
    status: hasEntitySchema ? 'pass' : 'fail',
    evidence: entityTypes.length ? `Types found: ${entityTypes.join(', ')}.` : 'No JSON-LD structured data was found on the crawled pages.',
    why: 'Structured data removes ambiguity about names, URLs and relationships. It is not a magic ranking input, but it does make your own facts machine-readable rather than inferred.',
    fix: 'Add Organization (and SoftwareApplication or LocalBusiness as applicable) JSON-LD. Use "launchos geo schema" to generate it from your verified brand profile.',
  });

  // 7. Claims supported by evidence
  const hasEvidenceLinks = pages.some((p) => Number(p.internal_links ?? 0) > 3);
  add({
    id: 'trust.supporting_evidence',
    requirement: 'Important claims are supported by something checkable (docs, data, demo, source)',
    status: brand?.githubUrl || hasEvidenceLinks ? 'pass' : 'unknown',
    evidence: brand?.githubUrl
      ? `Public repository recorded: ${brand.githubUrl}.`
      : 'No public repository or obvious evidence surface is recorded. LaunchOS cannot judge claim quality automatically.',
    why: 'Assistants and readers both discount unsupported superlatives. Something checkable — docs, a demo, source code, published data — is what makes a claim quotable.',
    fix: 'Link each significant claim to documentation, a demo or published data. Remove superlatives you cannot evidence.',
  });

  // 8. Consistent naming
  const titleVariants = unique(
    pages.map((p) => String(p.title ?? '')).map((t) => (t.match(new RegExp(`${escapeRe(brandName)}[a-z0-9.®™-]*`, 'i')) ?? [''])[0]).filter(Boolean)
  );
  add({
    id: 'identity.consistent_naming',
    requirement: 'The brand name is written the same way everywhere',
    status: titleVariants.length <= 1 ? 'pass' : 'fail',
    evidence: titleVariants.length ? `Variants seen in titles: ${titleVariants.join(' | ')}` : 'Brand name not found in any crawled title.',
    why: 'Spelling drift splits an entity across records, which is exactly how an assistant ends up describing two products where there is one.',
    fix: 'Pick one canonical spelling, including capitalisation and any suffix, and use it everywhere.',
  });

  // 9. Crawlability for AI user agents
  const robots = d.get<{ robots_txt: string | null }>('SELECT robots_txt FROM site_audits WHERE id = ?', audit.id);
  const robotsTxt = robots?.robots_txt ?? '';
  const blockedAgents = ['gptbot', 'claudebot', 'perplexitybot', 'google-extended', 'bingbot', 'applebot-extended', 'ccbot']
    .filter((a) => new RegExp(`user-agent:\\s*${a}[\\s\\S]{0,200}?disallow:\\s*/\\s*$`, 'im').test(robotsTxt));
  add({
    id: 'access.ai_crawler_policy',
    requirement: 'Your robots.txt policy for AI crawlers is deliberate',
    status: blockedAgents.length ? 'fail' : robotsTxt ? 'pass' : 'unknown',
    evidence: blockedAgents.length
      ? `robots.txt blocks: ${blockedAgents.join(', ')}.`
      : robotsTxt ? 'No full-site block for the common AI user agents was detected.' : 'No robots.txt content was captured, so the policy is unknown.',
    why: 'Blocking AI crawlers is a legitimate choice, but it is incompatible with wanting to appear in AI answers. The point is that the choice should be deliberate.',
    fix: blockedAgents.length
      ? `Decide whether blocking ${blockedAgents.join(', ')} is what you want. If you want to be cited, allow them.`
      : 'Keep the policy reviewed as new agents appear.',
  });

  const passed = checks.filter((c) => c.status === 'pass').length;
  const failed = checks.filter((c) => c.status === 'fail').length;
  const unknown = checks.filter((c) => c.status === 'unknown').length;

  logEvent(d, { projectId, actor: 'system', action: 'geo.audited', detail: { passed, failed, unknown } });
  return ok({
    project: project.name,
    pagesExamined: pages.length,
    checks,
    score: { passed, failed, unknown, total: checks.length },
    caveat:
      'This measures how well your site states its own facts in crawlable form. It is not a prediction of AI visibility. ' +
      'No one — including LaunchOS — can guarantee inclusion in an AI answer, and these checks do not model any provider\'s ranking.',
  });
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------------------------------------------------------------- query library

export function generateAiQueries(d: Db, projectId: string): Result<{ query: string; intent: string; rationale: string }[]> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);

  const category = project.category ?? 'tool';
  const audience = brand.targetAudience ?? 'users in this category';
  const problem = (brand.problemsSolved ?? '').split(/[.;\n]/)[0]?.trim() || 'the problem it solves';
  const name = brand.brandName;
  const features = brand.features.slice(0, 3);

  const out: { query: string; intent: string; rationale: string }[] = [
    { query: `best ${category} for ${audience}`, intent: 'commercial_investigation', rationale: 'The canonical recommendation prompt. Whoever is named here is the shortlist.' },
    { query: `free ${category} options`, intent: 'commercial_investigation', rationale: 'Free-tier filtering is one of the most common qualifiers in assistant prompts.' },
    { query: `alternatives to ${name}`, intent: 'commercial_investigation', rationale: 'Tests whether the brand is recognised as an entity with a comparison set at all.' },
    { query: `how do I ${problem.toLowerCase()}`, intent: 'informational', rationale: 'Problem-first phrasing: the product is only mentioned if the site explains the problem, not just the product.' },
    { query: `what is ${name}`, intent: 'navigational', rationale: 'Checks whether the description an assistant gives is accurate and current.' },
    { query: `is ${name} free`, intent: 'transactional', rationale: 'Pricing questions are answered from whatever text is crawlable; wrong answers here cost signups.' },
  ];
  for (const f of features) {
    out.push({ query: `${category} that can ${f.toLowerCase().slice(0, 60)}`, intent: 'commercial_investigation', rationale: `Capability-led query derived from the recorded feature "${f}".` });
  }
  if (project.country) {
    out.push({ query: `${category} for ${audience} in ${project.country}`, intent: 'commercial_investigation', rationale: 'Geography-qualified variant, relevant because the project targets a specific market.' });
  }

  d.tx(() => {
    d.run('DELETE FROM ai_search_queries WHERE project_id = ?', projectId);
    for (const q of out) {
      d.run(
        'INSERT INTO ai_search_queries (id, project_id, query, intent, rationale, created_at) VALUES (?,?,?,?,?,?)',
        newId('aiq'), projectId, q.query, q.intent, q.rationale, nowIso()
      );
    }
  });
  return ok(out);
}

export function listAiQueries(d: Db, projectId: string): { id: string; query: string; intent: string; rationale: string }[] {
  return d.all<Record<string, unknown>>('SELECT * FROM ai_search_queries WHERE project_id = ? ORDER BY created_at', projectId).map((r) => ({
    id: r.id as string, query: r.query as string, intent: r.intent as string, rationale: (r.rationale as string) ?? '',
  }));
}

/**
 * Records a dated, sourced observation of a real AI answer.
 *
 * The operator runs the query themselves and reports what they saw. LaunchOS
 * does not query AI providers: doing so would need a paid key, and a single
 * sampled answer is not reproducible anyway. Every observation is stored with
 * its provider, date and evidence so nothing is presented as a general fact.
 */
export function recordVisibility(
  d: Db,
  projectId: string,
  input: {
    provider: string;
    query: string;
    brandMentioned: boolean;
    cited?: boolean;
    citationUrls?: string[];
    evidenceKind: 'screenshot' | 'transcript' | 'url' | 'note';
    evidenceRef?: string;
    observedOn?: string;
    notes?: string;
    recordedBy: string;
  }
): Result<{ id: string; caveat: string }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!input.provider.trim() || !input.query.trim()) return err('provider and query are both required');
  if (input.evidenceKind !== 'note' && !input.evidenceRef) {
    return err(`evidence of kind "${input.evidenceKind}" needs a reference (a file path, URL or transcript)`);
  }
  const id = newId('aiv');
  const q = d.get<{ id: string }>('SELECT id FROM ai_search_queries WHERE project_id = ? AND query = ?', projectId, input.query);
  d.run(
    `INSERT INTO ai_visibility_observations (id, project_id, query_id, provider, query_text, observed_on, brand_mentioned,
     cited, citation_urls_json, evidence_kind, evidence_ref, notes, recorded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, q?.id ?? null, input.provider, input.query, input.observedOn ?? today(),
    input.brandMentioned ? 1 : 0, input.cited ? 1 : 0, j.stringify(input.citationUrls ?? []),
    input.evidenceKind, input.evidenceRef ?? null, input.notes ?? null, input.recordedBy, nowIso()
  );
  logEvent(d, { projectId, actor: input.recordedBy, action: 'geo.observation', detail: { provider: input.provider, mentioned: input.brandMentioned } });
  return ok({
    id,
    caveat:
      'Recorded as a single dated observation. Generative answers vary by account, region, model version and phrasing, ' +
      'so this is evidence of one result at one moment, not a measurable ranking.',
  });
}

export function visibilityHistory(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM ai_visibility_observations WHERE project_id = ? ORDER BY observed_on DESC', projectId);
}

// ---------------------------------------------------------------- entity consistency

/**
 * Compares the brand's own facts against the public records it controls.
 *
 * Only fetches URLs the operator recorded on the brand profile. Every mismatch
 * is reported with both values; LaunchOS never edits a third-party record.
 */
export async function checkEntityConsistency(d: Db, projectId: string): Promise<Result<{ field: string; source: string; sourceUrl: string; status: string; observed: string | null; canonical: string | null }[]>> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);

  const sources: { label: string; url: string }[] = [];
  if (project.websiteUrl) sources.push({ label: 'website', url: project.websiteUrl });
  if (brand.githubUrl) sources.push({ label: 'github', url: brand.githubUrl });
  for (const [k, v] of Object.entries(brand.social)) if (v) sources.push({ label: `social:${k}`, url: v });
  if (!sources.length) return err('no public records to compare; record a website, repository or social URLs on the brand profile first');

  const results: { field: string; source: string; sourceUrl: string; status: string; observed: string | null; canonical: string | null }[] = [];
  d.run('DELETE FROM entity_consistency_checks WHERE project_id = ?', projectId);

  for (const s of sources) {
    const res = await safeFetch(s.url, { maxBytes: 800_000 });
    if (!res.ok || res.value.status >= 400) {
      record('reachability', null, s, 'unreachable', res.ok ? `HTTP ${res.value.status}` : res.error);
      continue;
    }
    const doc = parseHtml(res.value.body);
    const text = doc.text.toLowerCase();
    const title = stripTags(doc.els.find((e) => e.tag === 'title')?.text ?? '');

    const nameFound = text.includes(brand.brandName.toLowerCase());
    record('brandName', brand.brandName, s, nameFound ? 'consistent' : 'missing', nameFound ? `Found in page text. Title: "${title}"` : `"${brand.brandName}" does not appear in the fetched text.`);

    if (brand.tagline) {
      const t = brand.tagline.toLowerCase();
      const found = text.includes(t);
      record('tagline', brand.tagline, s, found ? 'consistent' : 'different', found ? 'Exact tagline found.' : 'Canonical tagline not found in this record.');
    }
    if (project.websiteUrl && s.label !== 'website') {
      const host = new URL(project.websiteUrl).host.replace(/^www\./, '');
      const found = res.value.body.toLowerCase().includes(host);
      record('website', project.websiteUrl, s, found ? 'consistent' : 'missing', found ? `Links to ${host}.` : `No link to ${host} found on this record.`);
    }
  }

  function record(field: string, canonical: string | null, s: { label: string; url: string }, status: string, observed: string | null): void {
    d.run(
      `INSERT INTO entity_consistency_checks (id, project_id, field, canonical_value, source_label, source_url, observed_value, status, checked_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      newId('ecc'), projectId, field, canonical, s.label, s.url, observed, status, nowIso()
    );
    results.push({ field, source: s.label, sourceUrl: s.url, status, observed, canonical });
  }

  return ok(results);
}

// ---------------------------------------------------------------- JSON-LD generation

/**
 * Builds JSON-LD from verified brand facts only.
 *
 * Deliberately omits aggregateRating, review, and any address the project has
 * not recorded. Fabricating those to satisfy a validator is a guidelines
 * violation and makes the markup a lie.
 */
export function generateSchema(d: Db, projectId: string): Result<{ types: string[]; jsonLd: string; omitted: string[] }> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const omitted: string[] = [];
  const graph: Record<string, unknown>[] = [];

  const org: Record<string, unknown> = { '@type': 'Organization', name: brand.brandName };
  if (project.websiteUrl) org.url = project.websiteUrl;
  else omitted.push('Organization.url — no website URL on the project.');
  if (brand.shortDescription) org.description = brand.shortDescription;
  else omitted.push('Organization.description — no short description on the brand profile.');
  if (brand.logoPath) org.logo = brand.logoPath;
  else omitted.push('Organization.logo — no logo recorded.');
  const sameAs = [brand.githubUrl, ...Object.values(brand.social)].filter(Boolean);
  if (sameAs.length) org.sameAs = sameAs;
  else omitted.push('Organization.sameAs — no repository or social profile URLs recorded.');
  if (brand.contactPublic && brand.contactEmail) org.email = brand.contactEmail;
  else if (brand.contactEmail) omitted.push('Organization.email — a contact email exists but is not marked public.');
  graph.push(org);

  if (project.websiteUrl) {
    graph.push({ '@type': 'WebSite', name: brand.brandName, url: project.websiteUrl, publisher: { '@type': 'Organization', name: brand.brandName } });
  }

  const softwarePresets = ['saas', 'dev_tool', 'open_source', 'mobile_app', 'education'];
  if (softwarePresets.includes(project.preset)) {
    const app: Record<string, unknown> = {
      '@type': project.preset === 'mobile_app' ? 'MobileApplication' : 'SoftwareApplication',
      name: brand.brandName,
      applicationCategory: project.category ?? 'BusinessApplication',
    };
    if (project.websiteUrl) app.url = project.websiteUrl;
    if (brand.shortDescription) app.description = brand.shortDescription;
    app.operatingSystem = project.preset === 'mobile_app' ? 'iOS, Android' : 'Any (web)';
    if (brand.features.length) app.featureList = brand.features;
    // Offers are only emitted when the price is a fact we hold, never guessed.
    const model = (brand.pricingModel ?? '').toLowerCase();
    if (/free|open.?source/.test(model) && !/freemium/.test(model)) {
      app.offers = { '@type': 'Offer', price: '0', priceCurrency: 'USD' };
    } else if (brand.pricingDetail && /\d/.test(brand.pricingDetail)) {
      omitted.push('SoftwareApplication.offers — pricing detail contains numbers but LaunchOS will not parse a price into markup. Add the Offer by hand so the figure matches your pricing page exactly.');
    } else {
      omitted.push('SoftwareApplication.offers — no unambiguous price recorded.');
    }
    graph.push(app);
  }

  if (project.preset === 'local_business') {
    const lp = d.get<Record<string, unknown>>('SELECT * FROM local_profiles WHERE project_id = ?', projectId);
    if (lp && lp.street && lp.city) {
      graph.push({
        '@type': 'LocalBusiness',
        name: lp.business_name,
        address: {
          '@type': 'PostalAddress', streetAddress: lp.street, addressLocality: lp.city,
          addressRegion: lp.region ?? undefined, postalCode: lp.postal_code ?? undefined, addressCountry: lp.country ?? undefined,
        },
        telephone: lp.phone ?? undefined,
        url: project.websiteUrl ?? undefined,
      });
    } else {
      omitted.push('LocalBusiness — no verified street address recorded. LaunchOS will not invent a location to satisfy the schema.');
    }
  }

  omitted.push('aggregateRating and review — never generated. Rating markup must come from real, verifiable reviews on the page.');

  const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
  return ok({ types: graph.map((g) => String(g['@type'])), jsonLd, omitted });
}

/**
 * Generates an llms.txt file.
 *
 * Experimental convenience only. No major search or AI provider has committed
 * to it as a requirement, and it does nothing for Google AI Overviews. Normal
 * crawlability and accurate content matter far more.
 */
export function generateLlmsTxt(d: Db, projectId: string): Result<{ content: string; disclaimer: string }> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const audit = latestAudit(d, projectId);
  const pages = audit
    ? d.all<{ final_url: string; title: string | null; meta_description: string | null; word_count: number }>(
        'SELECT final_url, title, meta_description, word_count FROM audit_pages WHERE audit_id = ? AND status_code < 400 ORDER BY word_count DESC LIMIT 25', audit.id
      )
    : [];

  const lines: string[] = [`# ${brand.brandName}`, ''];
  if (brand.shortDescription) lines.push(`> ${brand.shortDescription}`, '');
  if (brand.valueProposition) lines.push(brand.valueProposition, '');
  if (brand.pricingModel) lines.push(`Pricing: ${[brand.pricingModel, brand.pricingDetail].filter(Boolean).join(' — ')}`, '');
  if (pages.length) {
    lines.push('## Pages', '');
    for (const p of pages) {
      const desc = p.meta_description ? `: ${p.meta_description}` : '';
      lines.push(`- [${p.title || p.final_url}](${p.final_url})${desc}`);
    }
    lines.push('');
  } else {
    lines.push('## Pages', '', '(No audit data yet — run "launchos audit" so this list reflects real pages.)', '');
  }
  if (brand.githubUrl) lines.push('## Source', '', `- [Repository](${brand.githubUrl})`, '');

  return ok({
    content: lines.join('\n'),
    disclaimer:
      'llms.txt is an experimental proposal, not a standard any major provider requires. Publishing it is harmless and ' +
      'occasionally useful, but it will not get you into AI Overviews or AI Mode. Fix crawlability, server-rendered text ' +
      'and factual accuracy first — those are what actually determine whether your content can be used.',
  });
}
