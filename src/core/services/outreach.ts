import { intOf, j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, today, type Result } from '../util';
import { getBrand, getProject } from './projects';
import { safeFetch } from '../net/safe-fetch';
import { parseHtml } from '../html/parse';

/**
 * Ethical outreach, communities and backlinks.
 *
 * Constraints enforced in code, not just documented:
 *  - a prospect needs a stated `contactBasis`: how you legitimately have this
 *    contact channel. No scraped contact details, no guessed addresses.
 *  - outreach drafts are per-prospect and need named approval before sending;
 *    LaunchOS never sends anything.
 *  - a bulk send is refused outright.
 *  - backlinks are only "verified" after fetching the page and finding the link.
 */

export const OPPORTUNITY_TYPES = [
  'guest_article_invited', 'community_resource', 'open_source_contribution', 'integration_partnership',
  'founder_interview', 'product_demonstration', 'original_research_citation', 'industry_resource_page',
  'directory_listing', 'press_pitch', 'educational_collaboration',
] as const;

export type Prospect = {
  id: string; organization: string; website: string | null; contactChannel: string | null;
  contactBasis: string; opportunityType: string; relevanceReason: string; source: string;
  status: string; outcome: string | null;
};

export function addProspect(
  d: Db,
  projectId: string,
  input: {
    organization: string; website?: string; contactChannel?: string; contactBasis: string;
    opportunityType: string; relevanceReason: string; source: string;
  }
): Result<Prospect> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!input.organization.trim()) return err('organization is required');
  if (!input.contactBasis.trim()) {
    return err(
      'contactBasis is required: state how you legitimately hold this contact channel ' +
      '(for example "published editorial contact on their site", "they invited submissions", "existing relationship"). ' +
      'LaunchOS does not accept scraped or guessed contact details.'
    );
  }
  if (!input.relevanceReason.trim()) return err('relevanceReason is required: say why this organisation specifically would care');
  if (!(OPPORTUNITY_TYPES as readonly string[]).includes(input.opportunityType)) {
    return err(`unknown opportunity type. Allowed: ${OPPORTUNITY_TYPES.join(', ')}`);
  }
  const id = newId('pros');
  const ts = nowIso();
  d.run(
    `INSERT INTO outreach_prospects (id, project_id, organization, website, contact_channel, contact_basis,
     opportunity_type, relevance_reason, source, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.organization.trim(), input.website ?? null, input.contactChannel ?? null,
    input.contactBasis.trim(), input.opportunityType, input.relevanceReason.trim(), input.source, 'identified', ts, ts
  );
  logEvent(d, { projectId, actor: 'user', action: 'outreach.prospect_added', target: id });
  return ok(listProspects(d, projectId).find((p) => p.id === id)!);
}

export function listProspects(d: Db, projectId: string): Prospect[] {
  return d.all<Record<string, unknown>>('SELECT * FROM outreach_prospects WHERE project_id = ? ORDER BY updated_at DESC', projectId).map((r) => ({
    id: r.id as string, organization: r.organization as string, website: (r.website as string) ?? null,
    contactChannel: (r.contact_channel as string) ?? null, contactBasis: r.contact_basis as string,
    opportunityType: r.opportunity_type as string, relevanceReason: r.relevance_reason as string,
    source: r.source as string, status: r.status as string, outcome: (r.outcome as string) ?? null,
  }));
}

export type OutreachDraft = { prospect: string; channel: string; subject: string; body: string; warnings: string[]; approvalRequired: true };

/** Drafts one message for one prospect, built from that prospect's own stated relevance. */
export function draftOutreach(d: Db, prospectId: string, kind: 'partnership' | 'press' | 'interview' | 'collaboration' | 'feature_announcement'): Result<OutreachDraft> {
  const row = d.get<Record<string, unknown>>('SELECT * FROM outreach_prospects WHERE id = ?', prospectId);
  if (!row) return err(`no prospect ${prospectId}`);
  const projectId = row.project_id as string;
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err('project or brand profile missing');

  const warnings: string[] = [];
  if (!row.contact_channel) warnings.push('No contact channel recorded. Find the organisation\'s published contact route; do not guess an address.');
  if (!brand.verifiedFields.shortDescription) warnings.push('The short description is not marked verified on the brand profile.');

  const org = row.organization as string;
  const why = row.relevance_reason as string;
  const what = brand.shortDescription ?? brand.tagline ?? '[no description recorded]';
  const url = project.websiteUrl ?? '[no URL recorded]';

  const subjects: Record<string, string> = {
    partnership: `Integration between ${brand.brandName} and ${org}?`,
    press: `${brand.brandName}: ${brand.tagline ?? 'what we built'}`,
    interview: `Would you have 20 minutes to talk about ${project.category ?? 'this problem'}?`,
    collaboration: `A possible collaboration with ${org}`,
    feature_announcement: `${brand.brandName} now does ${brand.features[0] ?? '[feature]'}`,
  };

  const bodies: Record<string, string> = {
    partnership: `Hello,\n\nI build ${brand.brandName} — ${what}.\n\nI am writing because ${why}\n\nA concrete integration I have in mind: [describe the specific integration, what each side provides, and who it helps].\n\nIf that is not a fit, no reply needed.\n\n${url}`,
    press: `Hello,\n\n${brand.brandName} is ${what}.\n\nI am writing to you specifically because ${why}\n\nFacts, no spin:\n${brand.features.slice(0, 3).map((f) => `- ${f}`).join('\n') || '- [features not recorded]'}\n- Pricing: ${brand.pricingModel ?? '[not recorded]'}\n\nHappy to answer questions or give you access. No pressure to cover it.\n\n${url}`,
    interview: `Hello,\n\nI build ${brand.brandName} (${what}).\n\n${why}\n\nI would like to ask you about [one specific question you genuinely want answered]. 20 minutes, your format, and I am happy for it to be on the record or not.\n\n${url}`,
    collaboration: `Hello,\n\n${brand.brandName} is ${what}.\n\n${why}\n\nWhat I would propose: [describe what each side does and what the audience gets].\n\n${url}`,
    feature_announcement: `Hello,\n\nAn update on ${brand.brandName} (${what}): ${brand.features[0] ?? '[feature]'}.\n\nI am telling you because ${why}\n\n${url}`,
  };

  const body = bodies[kind];
  if (body.includes('[')) warnings.push('The draft contains placeholders in square brackets. Fill them in yourself — a template sent as-is is spam.');
  return ok({ prospect: org, channel: (row.contact_channel as string) ?? 'unknown', subject: subjects[kind], body, warnings, approvalRequired: true });
}

/** Records an interaction. An outbound message needs explicit, named approval. */
export function recordInteraction(
  d: Db,
  prospectId: string,
  input: { direction: 'outbound' | 'inbound'; channel: string; summary: string; draftBody?: string; approvedBy?: string; occurredOn?: string }
): Result<{ id: string }> {
  const row = d.get<Record<string, unknown>>('SELECT * FROM outreach_prospects WHERE id = ?', prospectId);
  if (!row) return err(`no prospect ${prospectId}`);
  if (input.direction === 'outbound' && !input.approvedBy?.trim()) {
    return err('an outbound message must record who approved it. LaunchOS never sends messages and will not log an unapproved send.');
  }
  const id = newId('oint');
  d.run(
    `INSERT INTO outreach_interactions (id, prospect_id, direction, channel, summary, draft_body, approved_by, approved_at, occurred_on, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, prospectId, input.direction, input.channel, input.summary, input.draftBody ?? null,
    input.approvedBy ?? null, input.approvedBy ? nowIso() : null, input.occurredOn ?? today(), nowIso()
  );
  d.run('UPDATE outreach_prospects SET status = ?, updated_at = ? WHERE id = ?', input.direction === 'outbound' ? 'contacted' : 'replied', nowIso(), prospectId);
  logEvent(d, { projectId: row.project_id as string, actor: input.approvedBy ?? 'user', action: `outreach.${input.direction}`, target: prospectId });
  return ok({ id });
}

/** Deliberately refuses. Bulk unsolicited outreach is out of scope by design. */
export function bulkSend(): Result<never> {
  return err(
    'LaunchOS does not support bulk outreach. Sending the same message to many recipients who did not ask for it is spam, ' +
    'is illegal in several jurisdictions, and damages the sender domain. Draft and approve messages one prospect at a time.'
  );
}

// ---------------------------------------------------------------- communities

export function addCommunity(
  d: Db,
  projectId: string,
  input: { name: string; url?: string; kind: string; selfPromotionRules: string; permittedFormats?: string[]; relevanceReason?: string }
): Result<{ id: string; rulesVerified: boolean }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const verified = input.selfPromotionRules.trim().length > 20;
  if (!verified) {
    return err(
      'Record the community\'s actual self-promotion rules (at least a sentence, quoting or summarising what they say). ' +
      'LaunchOS will not plan participation in a community whose rules have not been read.'
    );
  }
  const id = newId('comm');
  d.run(
    `INSERT INTO communities (id, project_id, name, url, kind, self_promotion_rules, rules_verified, permitted_formats_json, relevance_reason, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.name, input.url ?? null, input.kind, input.selfPromotionRules.trim(), intOf(true),
    j.stringify(input.permittedFormats ?? []), input.relevanceReason ?? null, 'candidate', nowIso()
  );
  return ok({ id, rulesVerified: true });
}

export function listCommunities(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM communities WHERE project_id = ? ORDER BY created_at DESC', projectId);
}

// ---------------------------------------------------------------- backlinks

export const DISALLOWED_BACKLINK_ORIGINS = ['purchased', 'link_farm', 'pbn', 'comment_spam', 'hidden_link', 'reciprocal_scheme'];
export const ALLOWED_BACKLINK_ORIGINS = [
  'editorial', 'guest_article_invited', 'directory_listing', 'open_source_contribution',
  'integration_partner', 'community_resource', 'press_coverage', 'research_citation', 'unknown',
];

export function addBacklink(
  d: Db,
  projectId: string,
  input: { sourceUrl: string; targetUrl: string; anchor?: string; origin: string }
): Result<{ id: string }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (DISALLOWED_BACKLINK_ORIGINS.includes(input.origin)) {
    return err(
      `origin "${input.origin}" is a link scheme. LaunchOS does not track or support purchased links, link farms, ` +
      'private blog networks, comment spam, hidden links or reciprocal schemes designed to manipulate rankings.'
    );
  }
  if (!ALLOWED_BACKLINK_ORIGINS.includes(input.origin)) {
    return err(`unknown origin "${input.origin}". Allowed: ${ALLOWED_BACKLINK_ORIGINS.join(', ')}`);
  }
  const id = newId('bl');
  d.run(
    `INSERT INTO backlinks (id, project_id, source_url, target_url, anchor, origin, verified, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id, projectId, input.sourceUrl, input.targetUrl, input.anchor ?? null, input.origin, 0, nowIso()
  );
  return ok({ id });
}

/** Fetches each source page and checks the link is really there. No link, no credit. */
export async function verifyBacklinks(d: Db, projectId: string): Promise<Result<{ checked: number; present: number; missing: { sourceUrl: string; detail: string }[] }>> {
  const rows = d.all<Record<string, unknown>>('SELECT * FROM backlinks WHERE project_id = ?', projectId);
  if (!rows.length) return err('no backlinks recorded for this project');
  const missing: { sourceUrl: string; detail: string }[] = [];
  let present = 0;

  for (const r of rows) {
    const sourceUrl = r.source_url as string;
    const targetUrl = r.target_url as string;
    const res = await safeFetch(sourceUrl, { maxBytes: 1_500_000 });
    let status: number | null = null;
    let linkPresent = false;
    let detail = '';
    if (!res.ok) detail = res.error;
    else {
      status = res.value.status;
      if (status >= 400) detail = `source page returned HTTP ${status}`;
      else {
        const doc = parseHtml(res.value.body);
        const targetHost = hostOf(targetUrl);
        const anchors = doc.els.filter((e) => e.tag === 'a').map((e) => e.attrs['href'] ?? '');
        linkPresent = anchors.some((h) => {
          try { return new URL(h, sourceUrl).toString().startsWith(targetUrl) || hostOf(new URL(h, sourceUrl).toString()) === targetHost; }
          catch { return false; }
        });
        detail = linkPresent ? `Link to ${targetHost} found on the page (HTTP ${status}).` : `HTTP ${status} but no link to ${targetHost} was found in the HTML. Not counting it.`;
      }
    }
    if (linkPresent) present++;
    else missing.push({ sourceUrl, detail });
    d.run(
      'UPDATE backlinks SET verified = ?, last_checked = ?, http_status = ?, link_present = ? WHERE id = ?',
      intOf(linkPresent), today(), status, intOf(linkPresent), r.id as string
    );
    await new Promise((x) => setTimeout(x, 500));
  }
  logEvent(d, { projectId, actor: 'system', action: 'backlinks.verified', detail: { checked: rows.length, present } });
  return ok({ checked: rows.length, present, missing });
}

export function listBacklinks(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM backlinks WHERE project_id = ? ORDER BY verified DESC, created_at DESC', projectId);
}

const hostOf = (u: string): string => {
  try { return new URL(u).host.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
};

/** Suggests where relevant links could plausibly come from. Opportunities, not links. */
export function backlinkOpportunities(d: Db, projectId: string): Result<{ strategy: string; why: string; firstStep: string }[]> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const out: { strategy: string; why: string; firstStep: string }[] = [];

  if (brand.githubUrl) {
    out.push({
      strategy: 'Contribute upstream to a project you actually depend on',
      why: 'Contributor pages, changelogs and release notes carry genuine editorial links, and the relationship is real rather than transactional.',
      firstStep: 'List your dependencies, find an open issue you can genuinely fix, and fix it.',
    });
    out.push({
      strategy: 'Submit to the awesome-* list for your topic',
      why: 'Curated topic lists are read by exactly the audience you want and are routinely cited by both humans and assistants.',
      firstStep: 'Find the list, read its CONTRIBUTING file, and only submit if your project genuinely fits the scope.',
    });
  }
  out.push({
    strategy: 'Publish original data you are uniquely able to produce',
    why: 'Original measurements get cited because nobody else has them. This is the only link strategy that compounds without outreach.',
    firstStep: 'Identify one number you can measure that nobody has published, measure it honestly, and publish the method with it.',
  });
  out.push({
    strategy: 'Build an integration with a product your users already use',
    why: 'Integration directories and partner pages are editorial links with qualified referral traffic attached.',
    firstStep: 'Ask your users which tool they wish this connected to, then build that one.',
  });
  if (project.preset === 'local_business') {
    out.push({
      strategy: 'Local organisations you have a real relationship with',
      why: 'Chambers of commerce, suppliers, local sponsorships and community groups link to members, and the links are geographically relevant.',
      firstStep: 'List the organisations you already deal with and check which have a members or partners page.',
    });
  }
  out.push({
    strategy: 'Answer questions in public where you have genuine expertise',
    why: 'Being useful in public is how people find out you exist. Links follow, but they are not the point.',
    firstStep: 'Pick one community, record its rules with "launchos communities add", and contribute for a month before mentioning your product.',
  });
  return ok(out);
}
