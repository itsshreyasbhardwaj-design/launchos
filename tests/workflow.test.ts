import { describe, expect, it } from 'vitest';
import { freshDb, seedProject, fillBrand, addScreenshots, authorize } from './helpers';
import { matchDirectories, prepareListing, approveListing, recordSubmission, recordEvidence, listListings, propagateBrandChange, submissionInstructions } from '../src/core/services/listings';
import { listDirectories, confirmDirectory, getDirectory } from '../src/core/services/registry';
import { updateBrand, brandCompleteness, addAsset } from '../src/core/services/projects';
import { addKeywordHypotheses, buildClusters, classifyIntent, importSearchPerformance, listKeywords, buildContentMap, seoStrategy } from '../src/core/services/seo';
import { generateAiQueries, generateSchema, recordVisibility, generateLlmsTxt } from '../src/core/services/geo';
import { generateSocialDrafts, setDraftStatus, PLATFORMS, socialCardSvg } from '../src/core/services/social';
import { createCampaign, buildPlaybook, createPublishingTask, approvePublishingTask, CAMPAIGN_TEMPLATES } from '../src/core/services/launch';
import { addProspect, bulkSend, addBacklink, addCommunity, recordInteraction } from '../src/core/services/outreach';
import { analyzeExperiment, createExperiment, importAnalyticsCsv, dashboard } from '../src/core/services/analytics';
import { prepareAso, setLocalProfile } from '../src/core/services/channels';
import { launchReadiness, prioritize } from '../src/core/services/readiness';
import { buildReport, reportToMarkdown, reportToPdf } from '../src/core/services/reports';
import { fromCsv, clampText } from '../src/core/util';

describe('directory registry honesty', () => {
  it('seeds only entries with a real official URL and a verification source', () => {
    const d = freshDb();
    const all = listDirectories(d);
    expect(all.length).toBeGreaterThan(20);
    for (const dir of all) {
      expect(() => new URL(dir.officialUrl), dir.slug).not.toThrow();
      expect(dir.verificationSource.length, dir.slug).toBeGreaterThan(10);
      expect(dir.verificationStatus, dir.slug).toBe('unverified');
      expect(dir.lastVerified, dir.slug).toBeNull();
    }
  });

  it('never marks an uncertain destination as free', () => {
    const d = freshDb();
    for (const dir of listDirectories(d)) {
      expect(['free', 'freemium', 'paid', 'unknown']).toContain(dir.freeSubmission);
    }
    expect(getDirectory(d, 'theresanaiforthat')!.freeSubmission).toBe('unknown');
    expect(getDirectory(d, 'apple-app-store')!.freeSubmission).toBe('paid');
  });

  it('records an operator confirmation separately from a URL check', () => {
    const d = freshDb();
    const r = confirmDirectory(d, 'theresanaiforthat', { freeSubmission: 'free', submissionUrl: 'https://theresanaiforthat.com/submit', by: 'tester' });
    expect(r.ok).toBe(true);
    const dir = getDirectory(d, 'theresanaiforthat')!;
    expect(dir.verificationStatus).toBe('operator_confirmed');
    expect(dir.freeSubmission).toBe('free');
  });
});

describe('directory matching', () => {
  it('filters by preset and marks paid destinations as paid_only', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'saas' });
    fillBrand(d, p);
    const ms = (matchDirectories(d, p) as { ok: true; value: ReturnType<typeof matchDirectories> extends never ? never : never[] }).ok
      ? (matchDirectories(d, p) as never as { value: { directory: { slug: string }; eligible: string }[] }).value
      : [];
    const apple = ms.find((m) => m.directory.slug === 'apple-app-store')!;
    expect(apple.eligible).toBe('paid_only');
  });

  it('refuses Google Business Profile for an online-only project', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'saas' });
    fillBrand(d, p);
    const r = matchDirectories(d, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gbp = r.value.find((m) => m.directory.slug === 'google-business-profile')!;
    expect(gbp.eligible).toBe('not_eligible');
    expect(gbp.blockers.join(' ')).toMatch(/in-person/i);
  });

  it('allows Google Business Profile once in-person contact is recorded', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'local_business', country: 'IN' });
    fillBrand(d, p);
    setLocalProfile(d, p, { businessName: 'Test Cafe', street: '1 Road', city: 'Pune', servesCustomersInPerson: true });
    const r = matchDirectories(d, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const gbp = r.value.find((m) => m.directory.slug === 'google-business-profile')!;
    expect(gbp.eligible).toBe('eligible');
  });

  it('blocks launch platforms while the project is pre-launch', async () => {
    const d = freshDb();
    const p = await seedProject(d, { launchStatus: 'pre_launch' });
    fillBrand(d, p);
    const r = matchDirectories(d, p);
    if (!r.ok) throw new Error(r.error);
    const ph = r.value.find((m) => m.directory.slug === 'product-hunt')!;
    expect(ph.eligible).toBe('needs_check');
    expect(ph.blockers.join(' ')).toMatch(/pre-launch/);
  });

  it('respects geography against the project country', async () => {
    const d = freshDb();
    const p = await seedProject(d, { country: 'US' });
    fillBrand(d, p);
    const r = matchDirectories(d, p);
    if (!r.ok) throw new Error(r.error);
    const jd = r.value.find((m) => m.directory.slug === 'justdial')!;
    expect(jd.blockers.join(' ')).toMatch(/IN|covers/i);
  });
});

describe('listing lifecycle', () => {
  const setup = async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    addScreenshots(d, p);
    matchDirectories(d, p);
    return { d, p };
  };

  it('fills listing fields from the brand profile and never invents missing ones', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    updateBrand(d, p, { tagline: 'Only a tagline' });
    matchDirectories(d, p);
    const r = prepareListing(d, p, 'crunchbase');
    if (!r.ok) throw new Error(r.error);
    expect(r.value.fields.pricing).toBeUndefined();
    expect(r.value.warnings.join(' ')).toMatch(/pricing/i);
    expect(r.value.warnings.join(' ')).toMatch(/never guess/i);
  });

  it('respects platform character limits', async () => {
    const { d, p } = await setup();
    updateBrand(d, p, { tagline: 'x'.repeat(400) });
    const r = prepareListing(d, p, 'product-hunt');
    if (!r.ok) throw new Error(r.error);
    const limit = Number(getDirectory(d, 'product-hunt')!.fieldLimits.tagline);
    expect(r.value.fields.tagline.length).toBeLessThanOrEqual(limit);
    expect(r.value.warnings.join(' ')).toMatch(/trimmed/i);
  });

  it('refuses approval while warnings or missing assets remain', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    matchDirectories(d, p);
    prepareListing(d, p, 'alternativeto');
    const r = approveListing(d, p, 'alternativeto', 'tester');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/asset/i);
  });

  it('requires a named approver', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    expect(approveListing(d, p, 'alternativeto', '  ').ok).toBe(false);
  });

  it('refuses to record a submission before approval', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    const r = recordSubmission(d, p, 'alternativeto', { method: 'manual' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/approved/i);
  });

  it('will not mark a listing live without verified evidence', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    approveListing(d, p, 'alternativeto', 'tester');
    const sub = recordSubmission(d, p, 'alternativeto', { method: 'manual' });
    if (!sub.ok) throw new Error(sub.error);
    const ev = await recordEvidence(d, sub.value.submissionId, { kind: 'note', reference: 'I submitted it, honest' });
    if (!ev.ok) throw new Error(ev.error);
    expect(ev.value.verified).toBe(false);
    expect(ev.value.status).toBe('pending_review');
    expect(listListings(d, p).find((l) => l.directorySlug === 'alternativeto')!.status).toBe('pending_review');
  });

  it('refuses a paid-only destination even if asked to prepare it', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'mobile_app' });
    fillBrand(d, p);
    addScreenshots(d, p);
    matchDirectories(d, p);
    const r = prepareListing(d, p, 'apple-app-store');
    if (!r.ok) throw new Error(r.error);
    expect(r.value.status).toBe('paid_only');
    expect(approveListing(d, p, 'apple-app-store', 'tester').ok).toBe(false);
  });

  it('detects a duplicate listing instead of creating a second draft', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    prepareListing(d, p, 'alternativeto');
    expect(listListings(d, p).filter((l) => l.directorySlug === 'alternativeto')).toHaveLength(1);
  });

  it('flags published listings for update when verified brand facts change', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    approveListing(d, p, 'alternativeto', 'tester');
    const sub = recordSubmission(d, p, 'alternativeto', { method: 'manual' });
    if (!sub.ok) throw new Error(sub.error);
    const upd = updateBrand(d, p, { tagline: 'A completely new tagline' });
    if (!upd.ok) throw new Error(upd.error);
    const prop = propagateBrandChange(d, p, upd.value.changes.map((c) => c.field));
    expect(prop.flagged.some((f) => f.directorySlug === 'alternativeto' && f.status === 'needs_update')).toBe(true);
    expect(prop.tasks).toBeGreaterThan(0);
  });

  it('produces manual submission instructions with the exact copy', async () => {
    const { d, p } = await setup();
    prepareListing(d, p, 'alternativeto');
    const r = submissionInstructions(d, p, 'alternativeto');
    if (!r.ok) throw new Error(r.error);
    const joined = r.value.steps.join('\n');
    expect(joined).toMatch(/alternativeto\.net/);
    expect(joined).toMatch(/Route work without meetings/);
    expect(joined).toMatch(/launchos listings submitted/);
  });
});

describe('SEO engine', () => {
  it('classifies intent from recognisable patterns', () => {
    expect(classifyIntent('best crm for startups')).toBe('commercial_investigation');
    expect(classifyIntent('how to export a csv')).toBe('informational');
    expect(classifyIntent('buy premium plan')).toBe('transactional');
    expect(classifyIntent('dentist near me')).toBe('local');
    expect(classifyIntent('acme corp')).toBe('navigational');
  });

  it('labels operator keywords as hypotheses and never attaches a volume', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    addKeywordHypotheses(d, p, ['task routing', 'triage automation']);
    for (const k of listKeywords(d, p)) {
      expect(k.dataConfidence).toBe('qualitative_hypothesis');
      expect(k.volume).toBeNull();
      expect(k.impressions).toBeNull();
    }
  });

  it('marks imported Search Console rows as measured and parses the real columns', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const csv = 'Query,Clicks,Impressions,CTR,Position\ntask routing,34,1210,2.81%,8.4\n"a, quoted query",2,10,20%,3.1\n';
    const r = importSearchPerformance(d, p, csv, { provider: 'google_search_console' });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.imported).toBe(2);
    const kws = listKeywords(d, p);
    const routing = kws.find((k) => k.keyword === 'task routing')!;
    expect(routing.dataConfidence).toBe('measured');
    expect(routing.impressions).toBe(1210);
    expect(routing.position).toBeCloseTo(8.4, 1);
    expect(kws.some((k) => k.keyword === 'a, quoted query')).toBe(true);
  });

  it('never merges keywords of different intent into one cluster', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    addKeywordHypotheses(d, p, ['task routing pricing', 'how to set up task routing', 'buy task routing']);
    const r = buildClusters(d, p);
    if (!r.ok) throw new Error(r.error);
    for (const c of r.value) {
      const intents = new Set(c.keywords.map(classifyIntent));
      expect(intents.size).toBe(1);
    }
  });

  it('says plainly when a cluster has no measured demand behind it', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    addKeywordHypotheses(d, p, ['task routing software']);
    const r = buildClusters(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value[0].rationale).toMatch(/qualitative hypotheses/);
  });

  it('refuses to cluster with no keywords at all', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    expect(buildClusters(d, p).ok).toBe(false);
  });

  it('reports unknown existing coverage when no audit has run', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    addKeywordHypotheses(d, p, ['task routing software']);
    buildClusters(d, p);
    const r = buildContentMap(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value[0].reason).toMatch(/No audit data/i);
  });

  it('states its data caveats in the strategy output', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    addKeywordHypotheses(d, p, ['task routing software']);
    buildClusters(d, p);
    const r = seoStrategy(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.dataCaveats.join(' ')).toMatch(/does not report search volume/i);
  });
});

describe('GEO engine', () => {
  it('refuses a GEO audit with no crawl data rather than guessing', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const { geoAudit } = await import('../src/core/services/geo');
    const r = geoAudit(d, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/crawled pages/i);
  });

  it('builds a query library from recorded facts with a rationale each', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = generateAiQueries(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.length).toBeGreaterThan(5);
    for (const q of r.value) expect(q.rationale.length).toBeGreaterThan(15);
    expect(r.value.some((q) => /alternatives to/i.test(q.query))).toBe(true);
  });

  it('never generates aggregateRating or review markup', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = generateSchema(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.jsonLd).not.toMatch(/aggregateRating|"review"/);
    expect(r.value.omitted.join(' ')).toMatch(/aggregateRating/);
  });

  it('omits an Offer unless the price is unambiguous', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p, { pricingModel: 'Paid plans', pricingDetail: 'from 499 per month' });
    const r = generateSchema(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.jsonLd).not.toMatch(/"offers"/);
    expect(r.value.omitted.join(' ')).toMatch(/offers/);
  });

  it('emits a zero-price Offer for a genuinely free product', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p, { pricingModel: 'Free and open source' });
    const r = generateSchema(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.jsonLd).toMatch(/"price": "0"/);
  });

  it('never invents a LocalBusiness address', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'local_business' });
    fillBrand(d, p);
    const r = generateSchema(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.jsonLd).not.toMatch(/PostalAddress/);
    expect(r.value.omitted.join(' ')).toMatch(/will not invent a location/i);
  });

  it('requires real evidence for an AI visibility observation', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const noEvidence = recordVisibility(d, p, {
      provider: 'ChatGPT', query: 'best task router', brandMentioned: true,
      evidenceKind: 'screenshot', recordedBy: 'tester',
    });
    expect(noEvidence.ok).toBe(false);
    const ok = recordVisibility(d, p, {
      provider: 'ChatGPT', query: 'best task router', brandMentioned: true,
      evidenceKind: 'screenshot', evidenceRef: './evidence/chatgpt-2026-10-29.png', recordedBy: 'tester',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.caveat).toMatch(/not a measurable ranking/i);
  });

  it('does not claim llms.txt is a requirement', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = generateLlmsTxt(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.disclaimer).toMatch(/not a standard/i);
    expect(r.value.disclaimer).toMatch(/will not get you into AI Overviews/i);
  });
});

describe('content and social', () => {
  it('adapts copy per platform rather than duplicating it', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = generateSocialDrafts(d, p, { kind: 'product_announcement', platforms: ['x', 'linkedin', 'reddit'] });
    if (!r.ok) throw new Error(r.error);
    const bodies = r.value.map((x) => x.body);
    expect(new Set(bodies).size).toBe(3);
    expect(r.value.find((x) => x.platform === 'reddit')!.body).toMatch(/Disclosure: I am the maker/);
  });

  it('never exceeds a platform hard limit', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p, { shortDescription: 'y'.repeat(900), longDescription: 'z'.repeat(900) });
    const r = generateSocialDrafts(d, p, { kind: 'product_announcement', platforms: ['x', 'bluesky', 'threads'] });
    if (!r.ok) throw new Error(r.error);
    for (const draft of r.value) {
      const limit = PLATFORMS[draft.platform].hardLimit!;
      expect(draft.charCount, draft.platform).toBeLessThanOrEqual(limit);
      expect(draft.warnings.join(' ')).toMatch(/trimmed/i);
    }
  });

  it('refuses to mark a post published without evidence', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = generateSocialDrafts(d, p, { kind: 'product_announcement', platforms: ['x'] });
    if (!r.ok) throw new Error(r.error);
    const id = r.value[0].id;
    expect(setDraftStatus(d, id, 'published', 'tester').ok).toBe(false);
    expect(setDraftStatus(d, id, 'published', 'tester', 'https://x.com/user/status/1').ok).toBe(true);
  });

  it('refuses approval while a draft still carries warnings', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = generateSocialDrafts(d, p, { kind: 'product_announcement', platforms: ['x'] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value[0].warnings.length).toBeGreaterThan(0);
    expect(setDraftStatus(d, r.value[0].id, 'approved', 'tester').ok).toBe(false);
  });

  it('generates a valid, self-contained SVG card with no external dependency', () => {
    const svg = socialCardSvg({ kind: 'launch', title: 'Ship faster with fewer meetings', subtitle: 'Free and open source', badge: 'Launching today' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 1200 630"/);
    // The only URL may be the SVG namespace: no fonts, images or scripts fetched.
    expect(svg.replace('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<image|xlink:href|@import|<script/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it('escapes markup in card text', () => {
    const svg = socialCardSvg({ kind: 'launch', title: 'A & B <script>alert(1)</script>' });
    expect(svg).not.toMatch(/<script>/);
    expect(svg).toMatch(/&amp;/);
  });

  it('builds a content brief that separates verified facts from unverified claims', async () => {
    const { createBrief } = await import('../src/core/services/content');
    const d = freshDb();
    const p = await seedProject(d);
    updateBrand(d, p, { features: ['Rule-based routing'], problemsSolved: 'Triage eats an hour a day.' });
    const r = createBrief(d, p, { topic: 'task routing for small teams' });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.sourceMaterial.some((s) => !s.verified)).toBe(true);
    expect(r.value.checklist.join(' ')).toMatch(/No invented statistics/i);
  });
});

describe('approval and automation boundaries', () => {
  it('creates publishing tasks that await a named approver', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const t = createPublishingTask(d, p, { kind: 'listing', destination: 'AlternativeTo', instructions: 'paste the copy' });
    if (!t.ok) throw new Error(t.error);
    expect(approvePublishingTask(d, t.value.id, '  ').ok).toBe(false);
    const a = approvePublishingTask(d, t.value.id, 'tester');
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value.status).toBe('approved_for_manual_action');
  });

  it('refuses bulk outreach outright', () => {
    expect(bulkSend().ok).toBe(false);
  });

  it('requires a stated basis for holding a contact channel', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const bad = addProspect(d, p, { organization: 'Example Blog', contactBasis: '', opportunityType: 'press_pitch', relevanceReason: 'they cover this', source: 'their site' });
    expect(bad.ok).toBe(false);
    const good = addProspect(d, p, { organization: 'Example Blog', contactBasis: 'published editorial contact on their contact page', opportunityType: 'press_pitch', relevanceReason: 'they cover developer tooling weekly', source: 'their site' });
    expect(good.ok).toBe(true);
  });

  it('will not log an outbound message without an approver', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const pr = addProspect(d, p, { organization: 'Example Blog', contactBasis: 'published editorial contact', opportunityType: 'press_pitch', relevanceReason: 'covers this beat', source: 'their site' });
    if (!pr.ok) throw new Error(pr.error);
    expect(recordInteraction(d, pr.value.id, { direction: 'outbound', channel: 'email', summary: 'sent pitch' }).ok).toBe(false);
    expect(recordInteraction(d, pr.value.id, { direction: 'outbound', channel: 'email', summary: 'sent pitch', approvedBy: 'tester' }).ok).toBe(true);
  });

  it('rejects link schemes by origin', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    for (const origin of ['purchased', 'link_farm', 'pbn', 'comment_spam', 'hidden_link', 'reciprocal_scheme']) {
      const r = addBacklink(d, p, { sourceUrl: 'https://spam.example/x', targetUrl: 'https://example.com/', origin });
      expect(r.ok, origin).toBe(false);
    }
    expect(addBacklink(d, p, { sourceUrl: 'https://good.example/x', targetUrl: 'https://example.com/', origin: 'editorial' }).ok).toBe(true);
  });

  it('will not plan community participation without recorded rules', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    expect(addCommunity(d, p, { name: 'r/example', kind: 'forum', selfPromotionRules: 'no idea' }).ok).toBe(false);
    expect(addCommunity(d, p, { name: 'r/example', kind: 'forum', selfPromotionRules: 'Self-promotion allowed only in the monthly thread; account must be 30 days old.' }).ok).toBe(true);
  });

  it('prevents duplicate automation runs via an idempotency key', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    d.run('INSERT INTO automation_runs (id, project_id, job, trigger, status, started_at, idempotency_key) VALUES (?,?,?,?,?,?,?)', 'r1', p, 'audit', 'cron', 'succeeded', new Date().toISOString(), 'k1');
    expect(() =>
      d.run('INSERT INTO automation_runs (id, project_id, job, trigger, status, started_at, idempotency_key) VALUES (?,?,?,?,?,?,?)', 'r2', p, 'audit', 'cron', 'succeeded', new Date().toISOString(), 'k1')
    ).toThrow();
  });

  it('does not auto-generate a Show HN submission', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'dev_tool' });
    fillBrand(d, p);
    const r = buildPlaybook(d, p, 'show_hn');
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(r.value.copy)).toEqual(['facts_for_you_to_write_from']);
    expect(r.value.automationBoundary).toMatch(/will not generate or post/i);
    expect(r.value.policyNotes.join(' ')).toMatch(/vote manipulation/i);
  });

  it('warns against upvote solicitation in the Product Hunt playbook', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = buildPlaybook(d, p, 'product_hunt');
    if (!r.ok) throw new Error(r.error);
    expect(r.value.policyNotes.join(' ')).toMatch(/upvotes/i);
  });
});

describe('analytics and experiments', () => {
  it('imports a CSV with a BOM, CRLF line endings and quoted fields', () => {
    const rows = fromCsv('﻿Page,Clicks\r\n"https://a.example/x, y",12\r\nhttps://a.example/z,3\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[0].Page).toBe('https://a.example/x, y');
    expect(rows[1].Clicks).toBe('3');
  });

  it('shows nothing where no data exists instead of showing zero', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = dashboard(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.hasData).toBe(false);
    expect(r.value.search).toBeNull();
    expect(r.value.caveats.join(' ')).toMatch(/No search performance data/i);
  });

  it('does not double-count when the same export is imported twice', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const csv = 'Query,Clicks,Impressions\nalpha,10,100\nbeta,5,50\n';
    importSearchPerformance(d, p, csv, { provider: 'google_search_console' });
    importSearchPerformance(d, p, csv, { provider: 'google_search_console' });
    const r = dashboard(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.search!.impressions).toBe(150);
  });

  it('labels the origin of every metric', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    importAnalyticsCsv(d, p, 'Page,Sessions\nhttps://example.com/,42\n', { provider: 'ga4', dimension: 'page' });
    const rows = d.all<{ data_origin: string }>('SELECT data_origin FROM traffic_metrics WHERE project_id = ?', p);
    expect(rows.every((r) => r.data_origin === 'imported')).toBe(true);
  });

  it('refuses to call an underpowered result significant', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const e = createExperiment(d, p, { hypothesis: 'h', change: 'c', targetMetric: 'signup rate' });
    if (!e.ok) throw new Error(e.error);
    const a = analyzeExperiment(d, e.value.id, { sampleBaseline: 40, conversionsBaseline: 4, sampleVariant: 42, conversionsVariant: 13 });
    if (!a.ok) throw new Error(a.error);
    expect(a.value.pValueTwoSided!).toBeLessThan(0.05);
    expect(a.value.significantAt95).toBe(false);
    expect(a.value.verdict).toMatch(/underpowered|noise/i);
  });

  it('calls a well-powered result significant and reports the rates', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const e = createExperiment(d, p, { hypothesis: 'h', change: 'c', targetMetric: 'signup rate' });
    if (!e.ok) throw new Error(e.error);
    const a = analyzeExperiment(d, e.value.id, { sampleBaseline: 4000, conversionsBaseline: 400, sampleVariant: 4100, conversionsVariant: 520 });
    if (!a.ok) throw new Error(a.error);
    expect(a.value.significantAt95).toBe(true);
    expect(a.value.baselineRate).toBeCloseTo(0.1, 3);
  });

  it('handles an empty group without dividing by zero', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const e = createExperiment(d, p, { hypothesis: 'h', change: 'c', targetMetric: 'm' });
    if (!e.ok) throw new Error(e.error);
    const a = analyzeExperiment(d, e.value.id, { sampleBaseline: 0, conversionsBaseline: 0, sampleVariant: 10, conversionsVariant: 1 });
    if (!a.ok) throw new Error(a.error);
    expect(a.value.verdict).toMatch(/Not analysable/i);
  });

  it('rejects conversions greater than the sample size', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const e = createExperiment(d, p, { hypothesis: 'h', change: 'c', targetMetric: 'm' });
    if (!e.ok) throw new Error(e.error);
    expect(analyzeExperiment(d, e.value.id, { sampleBaseline: 10, conversionsBaseline: 20, sampleVariant: 10, conversionsVariant: 1 }).ok).toBe(false);
  });
});

describe('channels', () => {
  it('respects documented app store field limits', async () => {
    const d = freshDb();
    const p = await seedProject(d, { preset: 'mobile_app' });
    fillBrand(d, p, { tagline: 'a'.repeat(120), brandName: 'A very long application name indeed' });
    const r = prepareAso(d, p, 'apple');
    if (!r.ok) throw new Error(r.error);
    expect(r.value.fields.appTitle.length).toBeLessThanOrEqual(30);
    expect(r.value.fields.subtitle.length).toBeLessThanOrEqual(30);
    expect(r.value.fields.keywordField.length).toBeLessThanOrEqual(100);
    expect(r.value.costNote).toMatch(/fee/i);
  });

  it('states that an online-only business is not GBP eligible', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = setLocalProfile(d, p, { businessName: 'Online Only Ltd', servesCustomersInPerson: false });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.eligibility.eligible).toBe(false);
    expect(r.value.eligibility.reason).toMatch(/not eligible/i);
  });
});

describe('readiness, prioritization and reporting', () => {
  it('scores missing inputs as unknown rather than failed', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = launchReadiness(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.overall.unknown).toBeGreaterThan(0);
    expect(r.value.disclaimer).toMatch(/not a recognised/i);
  });

  it('ranks the first audit highest when nothing has been measured', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = prioritize(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value[0].id).toBe('bootstrap.audit');
    for (const o of r.value) expect(JSON.stringify(o)).not.toMatch(/estimated traffic|expected revenue|projected/i);
  });

  it('builds a report that names what it cannot claim', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    const r = buildReport(d, p, 'weekly');
    if (!r.ok) throw new Error(r.error);
    const md = reportToMarkdown(r.value);
    expect(md).toMatch(/## What this report does not claim/);
    expect(md).toMatch(/does not estimate future traffic/i);
  });

  it('writes a structurally valid PDF with no external library', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = buildReport(d, p, 'monthly');
    if (!r.ok) throw new Error(r.error);
    const pdf = reportToPdf(reportToMarkdown(r.value), 'Test report');
    const head = pdf.subarray(0, 8).toString('latin1');
    expect(head.startsWith('%PDF-1.')).toBe(true);
    expect(pdf.subarray(-8).toString('latin1')).toMatch(/%%EOF/);
    expect(pdf.toString('latin1')).toMatch(/\/Type \/Catalog/);
  });

  it('exports CSV rows that declare their data origin', async () => {
    const { reportToCsv } = await import('../src/core/services/reports');
    const d = freshDb();
    const p = await seedProject(d);
    fillBrand(d, p);
    matchDirectories(d, p);
    prepareListing(d, p, 'crunchbase');
    const r = reportToCsv(d, p);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.split('\n')[0]).toMatch(/data_origin/);
  });
});

describe('campaign templates and presets', () => {
  it('every campaign template declares an objective and channels', () => {
    for (const [k, v] of Object.entries(CAMPAIGN_TEMPLATES)) {
      expect(v.objective.length, k).toBeGreaterThan(15);
      expect(v.channels.length, k).toBeGreaterThan(0);
    }
  });

  it('refuses a campaign with neither an objective nor a template', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    expect(createCampaign(d, p, { name: 'x' }).ok).toBe(false);
    expect(createCampaign(d, p, { name: 'x', template: 'new_saas_launch' }).ok).toBe(true);
    expect(createCampaign(d, p, { name: 'y', template: 'nope' }).ok).toBe(false);
  });
});

describe('text helpers', () => {
  it('clamps on a word boundary and never exceeds the limit', () => {
    const out = clampText('a quick brown fox jumps over the lazy dog', 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith(' ')).toBe(false);
    expect(clampText('short', 20)).toBe('short');
  });
});
