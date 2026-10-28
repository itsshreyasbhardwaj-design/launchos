import { describe, expect, it } from 'vitest';
import { freshDb, fillBrand, addScreenshots } from './helpers';
import { createProject, authorizeDomain, updateBrand, exportProject, listProjects, addAsset } from '../src/core/services/projects';
import { runProjectAudit, latestAudit, listFindings, listSeoTasks } from '../src/core/services/audits';
import { importSearchPerformance, buildClusters, buildContentMap, deriveKeywordsFromSite } from '../src/core/services/seo';
import { geoAudit, generateSchema, generateAiQueries } from '../src/core/services/geo';
import { matchDirectories, prepareListing, approveListing, recordSubmission, recordEvidence, listListings } from '../src/core/services/listings';
import { createCampaign, buildPlaybook, scheduleLaunch } from '../src/core/services/launch';
import { generateSocialDrafts, setDraftStatus } from '../src/core/services/social';
import { buildUtm, importAnalyticsCsv, recordConversion, dashboard } from '../src/core/services/analytics';
import { launchReadiness, prioritize } from '../src/core/services/readiness';
import { buildReport, reportToMarkdown } from '../src/core/services/reports';

const SKIP = process.env.LAUNCHOS_SKIP_NETWORK_TESTS === '1';

/**
 * The complete workflow, in the order a founder would actually walk it.
 *
 * Crawls example.com, which IANA reserves for documentation and testing, so
 * this exercises the real crawler without bothering anybody's site. Set
 * LAUNCHOS_SKIP_NETWORK_TESTS=1 to skip it offline.
 */
describe.skipIf(SKIP)('end-to-end growth workflow', () => {
  it('runs every step and keeps a second project isolated', async () => {
    const d = freshDb();

    // 1-4. Create a project with website details and canonical brand facts.
    const created = await createProject(d, {
      name: 'Example Co', websiteUrl: 'https://example.com', preset: 'saas',
      category: 'developer tooling', country: 'IN', launchStatus: 'launched',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const p = created.value.id;
    fillBrand(d, p);
    addScreenshots(d, p);
    expect(authorizeDomain(d, p, 'example.com', 'IANA-reserved test domain', 'tester').ok).toBe(true);

    // 5-6. Run a real audit and get real findings.
    const audit = await runProjectAudit(d, p, { maxPages: 2, maxDepth: 1 });
    expect(audit.ok, audit.ok ? '' : audit.error).toBe(true);
    if (!audit.ok) return;
    expect(audit.value.result.pages.length).toBeGreaterThan(0);
    const findings = listFindings(d, audit.value.auditId);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(f.evidence.length).toBeGreaterThan(5);

    // 7. SEO tasks generated from the findings.
    expect(listSeoTasks(d, p, 'open').length).toBeGreaterThan(0);

    // 8. Keyword clusters, from both measured and derived data.
    expect(deriveKeywordsFromSite(d, p).ok).toBe(true);
    expect(importSearchPerformance(d, p, 'Query,Clicks,Impressions,Position\ntask routing software,34,1210,8.4\nhow to reduce triage time,51,2900,14.9\n', { provider: 'google_search_console' }).ok).toBe(true);
    const clusters = buildClusters(d, p);
    expect(clusters.ok).toBe(true);
    if (clusters.ok) expect(clusters.value.length).toBeGreaterThan(0);
    expect(buildContentMap(d, p).ok).toBe(true);

    // 9. GEO analysis, with no fabricated visibility claim.
    const geo = geoAudit(d, p);
    expect(geo.ok).toBe(true);
    if (geo.ok) {
      expect(geo.value.checks.length).toBeGreaterThan(5);
      expect(geo.value.caveat).toMatch(/not a prediction/i);
    }
    expect(generateAiQueries(d, p).ok).toBe(true);
    const schema = generateSchema(d, p);
    expect(schema.ok).toBe(true);
    if (schema.ok) expect(schema.value.jsonLd).not.toMatch(/aggregateRating/);

    // 10-13. Directories, listing preparation, approval, submission, evidence.
    const matches = matchDirectories(d, p);
    expect(matches.ok).toBe(true);
    if (!matches.ok) return;
    expect(matches.value.some((m) => m.eligible === 'eligible')).toBe(true);

    const draft = prepareListing(d, p, 'alternativeto');
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.status).toBe('content_ready');
    expect(approveListing(d, p, 'alternativeto', 'tester').ok).toBe(true);
    const sub = recordSubmission(d, p, 'alternativeto', { method: 'manual' });
    expect(sub.ok).toBe(true);
    if (!sub.ok) return;
    const evidence = await recordEvidence(d, sub.value.submissionId, { kind: 'live_url', reference: 'https://example.com/' });
    expect(evidence.ok).toBe(true);
    // example.com does not contain the brand name, so it must NOT be marked live.
    if (evidence.ok) {
      expect(evidence.value.verified).toBe(false);
      expect(listListings(d, p).find((l) => l.directorySlug === 'alternativeto')!.status).toBe('pending_review');
    }

    // 14-16. Campaign, launch playbook, social drafts, approval.
    const campaign = createCampaign(d, p, { name: 'Launch week', template: 'product_hunt_launch' });
    expect(campaign.ok).toBe(true);
    expect(buildPlaybook(d, p, 'product_hunt').ok).toBe(true);
    expect(scheduleLaunch(d, p, 'product_hunt', '2026-12-01').ok).toBe(true);
    const social = generateSocialDrafts(d, p, { kind: 'product_announcement', platforms: ['x', 'linkedin'] });
    expect(social.ok).toBe(true);
    if (social.ok) {
      const clean = social.value.find((s) => s.warnings.length === 0);
      if (clean) expect(setDraftStatus(d, clean.id, 'approved', 'tester').ok).toBe(true);
    }

    // 17-19. Tracking URLs, analytics import, measured results.
    expect(buildUtm(d, p, { label: 'PH', baseUrl: 'https://example.com/', source: 'producthunt', medium: 'referral', campaign: 'launch-week' }).ok).toBe(true);
    expect(importAnalyticsCsv(d, p, 'Page,Clicks,Impressions\nhttps://example.com/,120,4300\n', { provider: 'google_search_console', dimension: 'page' }).ok).toBe(true);
    expect(recordConversion(d, p, { eventName: 'signup', count: 12 }).ok).toBe(true);
    const dash = dashboard(d, p);
    expect(dash.ok).toBe(true);
    if (dash.ok) {
      expect(dash.value.hasData).toBe(true);
      expect(dash.value.conversions.find((x) => x.eventName === 'signup')!.total).toBe(12);
      expect(dash.value.listings.live).toBe(0);
    }

    // 20. Readiness, priorities and the weekly report.
    const readiness = launchReadiness(d, p);
    expect(readiness.ok).toBe(true);
    const opps = prioritize(d, p);
    expect(opps.ok).toBe(true);
    if (opps.ok) expect(opps.value.length).toBeGreaterThan(0);
    const report = buildReport(d, p, 'weekly');
    expect(report.ok).toBe(true);
    if (report.ok) {
      const md = reportToMarkdown(report.value);
      expect(md).toMatch(/Measured outcomes/);
      expect(md).toMatch(/does not estimate future traffic/i);
    }

    // 21-23. A second project stays isolated, and export is per project.
    const second = await createProject(d, { name: 'Other Co', websiteUrl: 'https://example.org', preset: 'local_business' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(listProjects(d)).toHaveLength(2);
    const exportSecond = exportProject(d, second.value.id);
    expect(exportSecond.site_audits).toHaveLength(0);
    expect(exportSecond.listing_drafts).toHaveLength(0);
    const exportFirst = exportProject(d, p);
    expect((exportFirst.site_audits as unknown[]).length).toBeGreaterThan(0);

    // 24. Security control: the second project cannot be audited without authorization.
    const unauthorized = await runProjectAudit(d, second.value.id);
    expect(unauthorized.ok).toBe(false);
  });
});
