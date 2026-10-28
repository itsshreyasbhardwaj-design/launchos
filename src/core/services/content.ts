import { j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, type Result } from '../util';
import { presetOf } from '../presets';
import { getBrand, getProject } from './projects';
import { latestAudit } from './audits';
import { listClusters } from './seo';

export type ContentBrief = {
  id: string;
  workingTitle: string;
  contentType: string;
  audience: string;
  searchIntent: string;
  userProblem: string;
  outline: { heading: string; covers: string }[];
  sourceMaterial: { claim: string; source: string; verified: boolean }[];
  visuals: string[];
  internalLinks: string[];
  cta: string;
  checklist: string[];
  status: string;
};

/**
 * Builds a content brief from evidence the project already holds.
 *
 * Source material is split into verified facts and claims that still need
 * backing. LaunchOS will not invent a statistic, a customer result or a
 * competitor weakness to fill an outline.
 */
export function createBrief(
  d: Db,
  projectId: string,
  opts: { clusterId?: string; topic?: string; contentType?: string }
): Result<ContentBrief> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const preset = presetOf(project.preset);

  const clusters = listClusters(d, projectId);
  const cluster = opts.clusterId ? clusters.find((c) => c.id === opts.clusterId) : undefined;
  if (opts.clusterId && !cluster) return err(`no cluster ${opts.clusterId}`);
  const topic = cluster?.label ?? opts.topic;
  if (!topic) return err('provide either a cluster id or a topic');

  const contentType = opts.contentType ?? cluster?.targetPageType ?? preset.contentTypes[0];
  const intent = cluster?.intent ?? 'informational';
  const problem = (brand.problemsSolved ?? '').split(/[.;\n]/)[0]?.trim() || `the reason someone searches for "${topic}"`;

  const outline: ContentBrief['outline'] = [];
  if (intent === 'commercial_investigation' && /vs|alternative|compare/.test(topic)) {
    outline.push(
      { heading: `What ${brand.brandName} does`, covers: 'Plain description, from the brand profile. No superlatives.' },
      { heading: 'How the options actually differ', covers: 'Only differences you can demonstrate. Do not characterise a competitor you have not used.' },
      { heading: 'Which to pick, and when not to pick ours', covers: 'Naming a case where you are the wrong choice is what makes the rest credible.' },
      { heading: 'Pricing, stated plainly', covers: brand.pricingModel ? `From the brand profile: ${brand.pricingModel}` : 'MISSING — no pricing recorded. Do not guess.' }
    );
  } else if (intent === 'transactional') {
    outline.push(
      { heading: 'What you get', covers: 'Features from the brand profile.' },
      { heading: 'What it costs', covers: brand.pricingModel ?? 'MISSING — record pricing first.' },
      { heading: 'How to start', covers: 'The literal first three steps a new user takes.' },
      { heading: 'Questions people ask before paying', covers: 'Real questions only.' }
    );
  } else {
    outline.push(
      { heading: `The problem: ${problem}`, covers: 'Describe the problem as the reader experiences it, before mentioning the product.' },
      { heading: 'Approaches that exist', covers: 'Including approaches that do not involve your product.' },
      { heading: 'A worked example', covers: 'A real, reproducible example with real output. Screenshots from the actual product.' },
      { heading: 'Where this approach breaks down', covers: 'Honest limits. This is the section readers trust.' },
      { heading: 'Next steps', covers: 'One clear action.' }
    );
  }

  const sourceMaterial: ContentBrief['sourceMaterial'] = [];
  for (const f of brand.features) {
    sourceMaterial.push({ claim: f, source: 'brand profile (features)', verified: !!brand.verifiedFields.features });
  }
  if (brand.pricingModel) sourceMaterial.push({ claim: `Pricing: ${brand.pricingModel}`, source: 'brand profile', verified: !!brand.verifiedFields.pricingModel });
  if (brand.githubUrl) sourceMaterial.push({ claim: 'Source code is public', source: brand.githubUrl, verified: true });
  if (cluster) {
    sourceMaterial.push({
      claim: `Target keywords: ${cluster.keywords.slice(0, 8).join(', ')}`,
      source: cluster.rationale,
      verified: cluster.rationale.includes('measured'),
    });
  }

  const audit = latestAudit(d, projectId);
  const internalLinks: string[] = [];
  if (audit) {
    const pages = d.all<{ final_url: string; title: string | null }>(
      'SELECT final_url, title FROM audit_pages WHERE audit_id = ? AND status_code < 400 LIMIT 40', audit.id
    );
    const words = topic.toLowerCase().split(/\s+/);
    for (const p of pages) {
      const hay = `${p.title ?? ''} ${p.final_url}`.toLowerCase();
      if (words.some((w) => w.length > 3 && hay.includes(w))) internalLinks.push(`${p.final_url}${p.title ? ` — ${p.title}` : ''}`);
    }
  }
  if (!internalLinks.length) internalLinks.push(audit ? 'No obviously related crawled page. Link to the homepage and the most relevant feature page.' : 'Run an audit so LaunchOS can suggest real internal links.');

  const visuals = [
    'A real product screenshot of the step being described — not a stock illustration.',
    'A before/after or input/output pair if the article claims an improvement.',
  ];
  if (contentType === 'comparison') visuals.push('A comparison table containing only facts you can point at.');

  const checklist = [
    'Every factual claim traced to a source in this brief.',
    'No invented statistics, customer counts, testimonials or awards.',
    'Screenshots are from the current build.',
    'Author is named, with their real experience of the topic.',
    `Meta title under 60 characters and description 120-155, both mentioning "${topic}".`,
    'Internal links added in both directions: this page to related pages and back.',
    'A reader with no prior context can follow it end to end.',
  ];
  const unverified = sourceMaterial.filter((s) => !s.verified);
  if (unverified.length) checklist.unshift(`Verify these first: ${unverified.map((s) => s.claim.slice(0, 40)).join('; ')}`);

  const id = newId('brief');
  d.run(
    `INSERT INTO content_briefs (id, project_id, working_title, content_type, audience, search_intent, user_problem,
     outline_json, source_material_json, visuals_json, internal_links_json, cta, checklist_json, cluster_id, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, titleFor(topic, contentType, intent), contentType,
    brand.targetAudience ?? 'Not recorded on the brand profile', intent, problem,
    j.stringify(outline), j.stringify(sourceMaterial), j.stringify(visuals), j.stringify(internalLinks),
    ctaFor(project.preset), j.stringify(checklist), cluster?.id ?? null, 'draft', nowIso()
  );
  logEvent(d, { projectId, actor: 'user', action: 'content.brief_created', target: id, detail: { topic, contentType } });
  return ok(getBrief(d, id)!);
}

function titleFor(topic: string, type: string, intent: string): string {
  const t = topic.replace(/\s+/g, ' ').trim();
  if (type === 'comparison') return `${t}: an honest comparison`;
  if (type === 'tutorial' || type === 'how_to') return `How to ${t}`;
  if (type === 'pricing_page') return `${t} pricing`;
  if (intent === 'informational') return `${t.charAt(0).toUpperCase()}${t.slice(1)}: what you need to know`;
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

const ctaFor = (preset: string): string => {
  const m: Record<string, string> = {
    saas: 'Start free — no credit card.', dev_tool: 'Install it and run the example.',
    open_source: 'Read the docs or star the repo.', mobile_app: 'Download it.',
    local_business: 'Call or book a slot.', ecommerce: 'See the product.',
    agency: 'Describe your project and get a reply.', nonprofit: 'See how the work is funded.',
    education: 'Take the first lesson.',
  };
  return m[preset] ?? 'Tell the reader the single next step.';
};

export function getBrief(d: Db, id: string): ContentBrief | null {
  const r = d.get<Record<string, unknown>>('SELECT * FROM content_briefs WHERE id = ?', id);
  return r ? rowToBrief(r) : null;
}

export function listBriefs(d: Db, projectId: string): ContentBrief[] {
  return d.all<Record<string, unknown>>('SELECT * FROM content_briefs WHERE project_id = ? ORDER BY created_at DESC', projectId).map(rowToBrief);
}

const rowToBrief = (r: Record<string, unknown>): ContentBrief => ({
  id: r.id as string,
  workingTitle: r.working_title as string,
  contentType: r.content_type as string,
  audience: r.audience as string,
  searchIntent: r.search_intent as string,
  userProblem: r.user_problem as string,
  outline: j.parse<ContentBrief['outline']>(r.outline_json, []),
  sourceMaterial: j.parse<ContentBrief['sourceMaterial']>(r.source_material_json, []),
  visuals: j.parse<string[]>(r.visuals_json, []),
  internalLinks: j.parse<string[]>(r.internal_links_json, []),
  cta: (r.cta as string) ?? '',
  checklist: j.parse<string[]>(r.checklist_json, []),
  status: r.status as string,
});

export function briefToMarkdown(b: ContentBrief): string {
  const lines = [
    `# Content brief: ${b.workingTitle}`, '',
    `- **Type:** ${b.contentType}`,
    `- **Audience:** ${b.audience}`,
    `- **Search intent:** ${b.searchIntent}`,
    `- **User problem:** ${b.userProblem}`,
    `- **Call to action:** ${b.cta}`, '',
    '## Outline', '',
    ...b.outline.flatMap((o) => [`### ${o.heading}`, '', o.covers, '']),
    '## Source material', '',
    ...b.sourceMaterial.map((s) => `- ${s.verified ? '[verified]' : '[NEEDS VERIFICATION]'} ${s.claim} — _${s.source}_`),
    '', '## Visuals', '',
    ...b.visuals.map((v) => `- ${v}`),
    '', '## Internal links', '',
    ...b.internalLinks.map((l) => `- ${l}`),
    '', '## Publication checklist', '',
    ...b.checklist.map((c) => `- [ ] ${c}`),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------- content refresh

export type RefreshItem = { url: string; title: string; issues: string[]; priority: 'high' | 'medium' | 'low' };

/**
 * Finds published pages that have drifted from current facts.
 *
 * Works from real crawl data: broken links, thin content, stale product facts
 * and missing metadata. Never claims a traffic decline without imported data.
 */
export function contentRefresh(d: Db, projectId: string): Result<RefreshItem[]> {
  const audit = latestAudit(d, projectId);
  if (!audit) return err('content refresh needs crawl data; run an audit first');
  const brand = getBrand(d, projectId);
  const pages = d.all<Record<string, unknown>>('SELECT * FROM audit_pages WHERE audit_id = ?', audit.id);
  const findings = d.all<{ page_url: string | null; check_id: string; title: string }>(
    'SELECT page_url, check_id, title FROM audit_findings WHERE audit_id = ?', audit.id
  );
  const metrics = d.all<{ dimension_value: string; clicks: number | null; impressions: number | null }>(
    "SELECT dimension_value, clicks, impressions FROM traffic_metrics WHERE project_id = ? AND dimension = 'page'", projectId
  );
  const metricByUrl = new Map(metrics.map((m) => [m.dimension_value, m]));

  const out: RefreshItem[] = [];
  for (const p of pages) {
    const url = String(p.final_url ?? p.url);
    const issues: string[] = [];
    for (const f of findings.filter((x) => x.page_url === p.url)) issues.push(`${f.check_id}: ${f.title}`);
    if (Number(p.word_count ?? 0) < 200) issues.push(`Thin page: ${p.word_count} words in the HTML response.`);
    if (Number(p.images_total ?? 0) === 0) issues.push('No images: a product page with no screenshot is hard to trust.');
    if (brand && p.meta_description && !String(p.meta_description).toLowerCase().includes(brand.brandName.toLowerCase().split(' ')[0])) {
      issues.push('Meta description does not mention the brand.');
    }
    const m = metricByUrl.get(url);
    if (m) {
      if ((m.impressions ?? 0) > 100 && (m.clicks ?? 0) === 0) {
        issues.push(`Measured: ${m.impressions} impressions and 0 clicks in the imported data. The title and description are not earning the click.`);
      }
    } else if (metrics.length) {
      issues.push('No rows for this URL in the imported search data, so it may not be getting impressions at all.');
    }
    if (!issues.length) continue;
    out.push({
      url, title: String(p.title ?? '(no title)'), issues,
      priority: issues.length >= 4 ? 'high' : issues.length >= 2 ? 'medium' : 'low',
    });
  }
  out.sort((a, b) => b.issues.length - a.issues.length);
  return ok(out);
}
