import { type Db } from '../db';
import { err, ok, type Result } from '../util';
import { presetOf } from '../presets';
import { brandCompleteness, getBrand, getProject, listDomains } from './projects';
import { latestAudit } from './audits';

/**
 * Launch readiness scoring.
 *
 * Every criterion is a transparent rule with its own evidence line. A missing
 * input scores 'unknown', never 'failed' — and the composite number is
 * explicitly a LaunchOS checklist percentage, not an industry metric.
 */
export type Criterion = { id: string; label: string; state: 'pass' | 'fail' | 'unknown'; weight: number; evidence: string; fix: string };
export type Area = { area: string; criteria: Criterion[]; passed: number; failed: number; unknown: number; percent: number };
export type Readiness = {
  project: string;
  areas: Area[];
  overall: { passed: number; failed: number; unknown: number; total: number; percentOfKnown: number; percentOfAll: number };
  disclaimer: string;
};

export function launchReadiness(d: Db, projectId: string): Result<Readiness> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const brand = getBrand(d, projectId);
  const preset = presetOf(project.preset);
  const audit = latestAudit(d, projectId);
  const domains = listDomains(d, projectId);
  const completeness = brandCompleteness(d, projectId);
  const n = (sql: string, ...p: unknown[]): number => Number(d.get<{ n: number }>(sql, ...p)?.n ?? 0);

  const findingsBySeverity = audit
    ? Object.fromEntries(
        d.all<{ severity: string; n: number }>('SELECT severity, COUNT(*) AS n FROM audit_findings WHERE audit_id = ? GROUP BY severity', audit.id)
          .map((r) => [r.severity, Number(r.n)])
      )
    : {};

  const areas: Area[] = [];
  const area = (name: string, criteria: Criterion[]): void => {
    const passed = criteria.filter((c) => c.state === 'pass').length;
    const failed = criteria.filter((c) => c.state === 'fail').length;
    const unknown = criteria.filter((c) => c.state === 'unknown').length;
    const known = passed + failed;
    areas.push({ area: name, criteria, passed, failed, unknown, percent: known ? Math.round((passed / known) * 100) : 0 });
  };

  area('Website accessibility', [
    {
      id: 'site.url_set', label: 'A public website URL is recorded', weight: 3,
      state: project.websiteUrl ? 'pass' : 'fail',
      evidence: project.websiteUrl ?? 'No website URL on the project.',
      fix: 'Set the website URL with "launchos project update".',
    },
    {
      id: 'site.https', label: 'The site is served over HTTPS', weight: 3,
      state: !audit ? 'unknown' : project.websiteUrl?.startsWith('https://') && !findingsBySeverity['critical'] ? 'pass' : audit && hasFinding(d, audit.id, 'https.missing') ? 'fail' : 'pass',
      evidence: audit ? (hasFinding(d, audit.id, 'https.missing') ? 'The audit found the site is not on HTTPS.' : 'No HTTPS finding in the latest audit.') : 'No audit run yet.',
      fix: 'Enable TLS and 301-redirect HTTP to HTTPS. Free on every major static host.',
    },
    {
      id: 'site.audited', label: 'An audit has been run', weight: 2,
      state: audit ? 'pass' : 'fail',
      evidence: audit ? `Audit ${audit.id} crawled ${audit.pagesCrawled} page(s) on ${audit.startedAt.slice(0, 10)}.` : 'No completed audit.',
      fix: 'Run "launchos audit --project <slug>".',
    },
  ]);

  area('Technical SEO', [
    {
      id: 'seo.no_critical', label: 'No critical findings', weight: 4,
      state: !audit ? 'unknown' : (findingsBySeverity['critical'] ?? 0) === 0 ? 'pass' : 'fail',
      evidence: audit ? `${findingsBySeverity['critical'] ?? 0} critical finding(s).` : 'No audit run yet.',
      fix: 'Open the audit findings and fix the critical ones first.',
    },
    {
      id: 'seo.no_high', label: 'No high-severity findings', weight: 3,
      state: !audit ? 'unknown' : (findingsBySeverity['high'] ?? 0) === 0 ? 'pass' : 'fail',
      evidence: audit ? `${findingsBySeverity['high'] ?? 0} high-severity finding(s).` : 'No audit run yet.',
      fix: 'Work the high-severity list; each finding carries a suggested fix.',
    },
    {
      id: 'seo.sitemap', label: 'A readable sitemap exists', weight: 2,
      state: !audit ? 'unknown' : audit.sitemapUrls.length ? 'pass' : 'fail',
      evidence: audit ? `${audit.sitemapUrls.length} URL(s) discovered via sitemap.` : 'No audit run yet.',
      fix: 'Publish /sitemap.xml and reference it from robots.txt.',
    },
  ]);

  area('Search engine verification', [
    {
      id: 'verify.gsc', label: 'Google Search Console ownership verified', weight: 3,
      state: domains.some((x) => x.verifiedSearchConsole) ? 'pass' : domains.length ? 'fail' : 'unknown',
      evidence: domains.length ? `${domains.filter((x) => x.verifiedSearchConsole).length} of ${domains.length} domain(s) marked verified.` : 'No domains registered.',
      fix: 'Verify in Search Console, then record it: "launchos domains verified <host> --search-console".',
    },
    {
      id: 'verify.bing', label: 'Bing Webmaster Tools ownership verified', weight: 2,
      state: domains.some((x) => x.verifiedBing) ? 'pass' : domains.length ? 'fail' : 'unknown',
      evidence: domains.length ? `${domains.filter((x) => x.verifiedBing).length} of ${domains.length} domain(s) marked verified.` : 'No domains registered.',
      fix: 'Verify in Bing Webmaster Tools (it can import from Search Console), then record it.',
    },
  ]);

  area('Product messaging', [
    {
      id: 'brand.required_fields', label: 'Required brand fields are filled in', weight: 4,
      state: completeness.missing.length === 0 ? 'pass' : 'fail',
      evidence: completeness.missing.length ? `Missing: ${completeness.missing.join(', ')}` : `All ${completeness.complete.length} required fields present.`,
      fix: 'Fill them in with "launchos brand set".',
    },
    {
      id: 'brand.verified', label: 'Brand facts are marked verified', weight: 3,
      state: completeness.unverified.length === 0 && completeness.complete.length > 0 ? 'pass' : 'fail',
      evidence: completeness.unverified.length ? `Unverified: ${completeness.unverified.join(', ')}` : 'All present fields are marked verified.',
      fix: 'Confirm each field against reality and mark it: "launchos brand verify <field> --how <source>".',
    },
    {
      id: 'brand.pricing_public', label: 'Pricing is recorded', weight: 2,
      state: brand?.pricingModel ? 'pass' : 'fail',
      evidence: brand?.pricingModel ?? 'No pricing model recorded.',
      fix: 'Record the pricing model, even if it is "free and open source".',
    },
  ]);

  const listingsReady = n("SELECT COUNT(*) AS n FROM listing_drafts WHERE project_id = ? AND status IN ('content_ready','ready_for_submission','submitted','live')", projectId);
  const eligibleDirs = n("SELECT COUNT(*) AS n FROM directory_eligibility WHERE project_id = ? AND eligible = 'eligible'", projectId);
  area('Listing preparation', [
    {
      id: 'listings.matched', label: 'Directory matching has been run', weight: 2,
      state: eligibleDirs > 0 ? 'pass' : n('SELECT COUNT(*) AS n FROM directory_eligibility WHERE project_id = ?', projectId) ? 'fail' : 'unknown',
      evidence: `${eligibleDirs} eligible destination(s) identified.`,
      fix: 'Run "launchos directories match".',
    },
    {
      id: 'listings.prepared', label: 'At least one listing is prepared', weight: 2,
      state: listingsReady > 0 ? 'pass' : 'fail',
      evidence: `${listingsReady} listing(s) at content_ready or beyond.`,
      fix: 'Run "launchos listings prepare <directory>".',
    },
  ]);

  area('Analytics setup', [
    {
      id: 'analytics.imported', label: 'Search or analytics data has been imported', weight: 2,
      state: n('SELECT COUNT(*) AS n FROM analytics_imports WHERE project_id = ?', projectId) + n('SELECT COUNT(*) AS n FROM search_performance_imports WHERE project_id = ?', projectId) > 0 ? 'pass' : 'fail',
      evidence: `${n('SELECT COUNT(*) AS n FROM analytics_imports WHERE project_id = ?', projectId)} analytics import(s), ${n('SELECT COUNT(*) AS n FROM search_performance_imports WHERE project_id = ?', projectId)} search import(s).`,
      fix: 'Import a Search Console CSV export: "launchos analytics import".',
    },
    {
      id: 'analytics.conversions', label: 'At least one conversion event is recorded', weight: 2,
      state: n('SELECT COUNT(*) AS n FROM conversion_events WHERE project_id = ?', projectId) > 0 ? 'pass' : 'fail',
      evidence: `${n('SELECT COUNT(*) AS n FROM conversion_events WHERE project_id = ?', projectId)} conversion event row(s).`,
      fix: 'Record what you actually measure: signups, installs, inquiries.',
    },
    {
      id: 'analytics.utm', label: 'Tracking URLs are being used', weight: 1,
      state: n('SELECT COUNT(*) AS n FROM utm_campaigns WHERE project_id = ?', projectId) > 0 ? 'pass' : 'fail',
      evidence: `${n('SELECT COUNT(*) AS n FROM utm_campaigns WHERE project_id = ?', projectId)} tracking URL(s) built.`,
      fix: 'Build consistent URLs with "launchos utm build" so channels are distinguishable.',
    },
  ]);

  area('Documentation and brand consistency', [
    {
      id: 'geo.structured_data', label: 'Entity structured data is published', weight: 2,
      state: !audit ? 'unknown' : n("SELECT COUNT(*) AS n FROM structured_data_results WHERE audit_id = ?", audit.id) > 0 ? 'pass' : 'fail',
      evidence: audit ? `${n('SELECT COUNT(*) AS n FROM structured_data_results WHERE audit_id = ?', audit.id)} JSON-LD block(s) found in the crawl.` : 'No audit run yet.',
      fix: 'Generate it from verified facts: "launchos geo schema".',
    },
    {
      id: 'geo.entity_consistency', label: 'Brand facts agree across public records', weight: 2,
      state: (() => {
        const total = n('SELECT COUNT(*) AS n FROM entity_consistency_checks WHERE project_id = ?', projectId);
        if (!total) return 'unknown';
        return n("SELECT COUNT(*) AS n FROM entity_consistency_checks WHERE project_id = ? AND status NOT IN ('consistent')", projectId) === 0 ? 'pass' : 'fail';
      })(),
      evidence: `${n("SELECT COUNT(*) AS n FROM entity_consistency_checks WHERE project_id = ? AND status != 'consistent'", projectId)} inconsistency/inconsistencies recorded.`,
      fix: 'Run "launchos geo entity" and fix each mismatch at its source.',
    },
  ]);

  const storeRequired = preset.modules.includes('aso');
  if (storeRequired) {
    area('App store readiness', [
      {
        id: 'aso.listing', label: 'Store listing copy prepared', weight: 3,
        state: n('SELECT COUNT(*) AS n FROM aso_listings WHERE project_id = ?', projectId) > 0 ? 'pass' : 'fail',
        evidence: `${n('SELECT COUNT(*) AS n FROM aso_listings WHERE project_id = ?', projectId)} store listing(s) drafted.`,
        fix: 'Run "launchos aso prepare --store apple|google".',
      },
    ]);
  }

  const all = areas.flatMap((a) => a.criteria);
  const passed = all.filter((c) => c.state === 'pass').length;
  const failed = all.filter((c) => c.state === 'fail').length;
  const unknown = all.filter((c) => c.state === 'unknown').length;

  return ok({
    project: project.name,
    areas,
    overall: {
      passed, failed, unknown, total: all.length,
      percentOfKnown: passed + failed ? Math.round((passed / (passed + failed)) * 100) : 0,
      percentOfAll: Math.round((passed / all.length) * 100),
    },
    disclaimer:
      'This is a LaunchOS checklist percentage, not a recognised SEO, GEO or marketing metric, and it does not predict ' +
      'rankings or traffic. Criteria scored "unknown" are missing inputs rather than failures; "percentOfKnown" excludes them.',
  });
}

const hasFinding = (d: Db, auditId: string, checkId: string): boolean =>
  !!d.get('SELECT id FROM audit_findings WHERE audit_id = ? AND check_id = ?', auditId, checkId);

// ---------------------------------------------------------------- prioritization

export type Opportunity = {
  id: string;
  title: string;
  detail: string;
  area: string;
  relevance: number;
  effort: 'trivial' | 'small' | 'medium' | 'large';
  requiredAccess: string;
  costCategory: 'free' | 'free_account_needed' | 'paid_blocked';
  strategicBenefit: string;
  verification: string;
  dependencies: string[];
  score: number;
};

const EFFORT_COST: Record<string, number> = { trivial: 1, small: 2, medium: 4, large: 8 };

/**
 * Ranks the next actions by relevance / effort, with blockers applied.
 *
 * Deliberately does NOT estimate traffic, conversion rate or revenue. Those
 * numbers would be fabricated, and a fabricated ROI is worse than no ROI.
 */
export function prioritize(d: Db, projectId: string): Result<Opportunity[]> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const out: Opportunity[] = [];
  const audit = latestAudit(d, projectId);

  if (audit) {
    const findings = d.all<Record<string, unknown>>(
      "SELECT * FROM audit_findings WHERE audit_id = ? AND severity != 'info' ORDER BY severity", audit.id
    );
    const sevWeight: Record<string, number> = { critical: 95, high: 75, medium: 50, low: 25 };
    for (const f of findings) {
      out.push({
        id: f.id as string,
        title: f.title as string,
        detail: `${f.page_url ? `${f.page_url}\n` : ''}${f.suggestion}`,
        area: 'technical_seo',
        relevance: sevWeight[f.severity as string] ?? 20,
        effort: (f.complexity as Opportunity['effort']) ?? 'medium',
        requiredAccess: 'Your own codebase or hosting configuration.',
        costCategory: 'free',
        strategicBenefit: f.impact_hypothesis as string,
        verification: f.verification as string,
        dependencies: [],
        score: 0,
      });
    }
  } else {
    out.push({
      id: 'bootstrap.audit', title: 'Run the first site audit', detail: 'Everything else depends on knowing the current state of the site.',
      area: 'technical_seo', relevance: 100, effort: 'trivial',
      requiredAccess: 'An authorized domain on this project.', costCategory: 'free',
      strategicBenefit: 'Without a crawl, every recommendation would be guesswork.',
      verification: 'A completed audit appears under "launchos audit list".', dependencies: [], score: 0,
    });
  }

  const completeness = brandCompleteness(d, projectId);
  if (completeness.missing.length) {
    out.push({
      id: 'brand.fill', title: `Complete ${completeness.missing.length} missing brand field(s)`,
      detail: `Missing: ${completeness.missing.join(', ')}. Listings, social drafts and structured data are all generated from these, and LaunchOS will not invent them.`,
      area: 'messaging', relevance: 85, effort: 'small',
      requiredAccess: 'Facts only you know.', costCategory: 'free',
      strategicBenefit: 'Unblocks listing preparation, schema generation and content briefs at once.',
      verification: '"launchos brand show" reports no missing fields.', dependencies: [], score: 0,
    });
  }
  if (completeness.unverified.length) {
    out.push({
      id: 'brand.verify', title: `Verify ${completeness.unverified.length} brand field(s)`,
      detail: `Unverified: ${completeness.unverified.join(', ')}. Approval gates block publication while these are unverified.`,
      area: 'messaging', relevance: 70, effort: 'trivial',
      requiredAccess: 'None.', costCategory: 'free',
      strategicBenefit: 'Lets listings and social drafts be approved.',
      verification: 'The listing approval gate stops complaining.', dependencies: ['brand.fill'], score: 0,
    });
  }

  const domains = listDomains(d, projectId);
  if (!domains.some((x) => x.verifiedSearchConsole)) {
    out.push({
      id: 'verify.gsc', title: 'Verify the site in Google Search Console',
      detail: 'Search Console is the only free source of your real query, impression and index-coverage data. Without it, keyword work is guesswork.',
      area: 'search_engines', relevance: 90, effort: 'small',
      requiredAccess: 'DNS or file access to the domain, plus a free Google account.', costCategory: 'free_account_needed',
      strategicBenefit: 'Turns qualitative keyword hypotheses into measured demand data.',
      verification: 'Search Console shows performance data, and you record it with "launchos domains verified".',
      dependencies: [], score: 0,
    });
  }

  const eligible = d.all<{ slug: string; name: string; relevance: number }>(
    `SELECT dr.slug, dr.name, de.relevance FROM directory_eligibility de
     JOIN directory_registry dr ON dr.id = de.directory_id
     WHERE de.project_id = ? AND de.eligible = 'eligible'
       AND NOT EXISTS (SELECT 1 FROM listing_drafts ld WHERE ld.project_id = de.project_id AND ld.directory_id = de.directory_id)
     ORDER BY de.relevance DESC LIMIT 6`, projectId
  );
  for (const e of eligible) {
    out.push({
      id: `listing.${e.slug}`, title: `Prepare the ${e.name} listing`,
      detail: `Eligibility is confirmed and relevance scored ${e.relevance}/100. Run "launchos listings prepare ${e.slug}".`,
      area: 'listings', relevance: Math.min(80, e.relevance), effort: 'small',
      requiredAccess: 'An account on the destination.', costCategory: 'free_account_needed',
      strategicBenefit: 'A relevant listing is a durable discovery surface and a consistent brand record for answer engines.',
      verification: 'The listing reaches "live" with verified evidence.', dependencies: ['brand.fill'], score: 0,
    });
  }
  if (!d.get('SELECT id FROM directory_eligibility WHERE project_id = ?', projectId)) {
    out.push({
      id: 'directories.match', title: 'Match this project against the directory registry',
      detail: 'Identifies which destinations are relevant, free and eligible — and which to ignore.',
      area: 'listings', relevance: 75, effort: 'trivial',
      requiredAccess: 'None.', costCategory: 'free',
      strategicBenefit: 'Stops you spending time on destinations that will reject you or charge you.',
      verification: '"launchos directories match" lists eligible destinations.', dependencies: [], score: 0,
    });
  }

  const kws = Number(d.get<{ n: number }>("SELECT COUNT(*) AS n FROM keyword_opportunities WHERE project_id = ? AND data_confidence = 'measured'", projectId)?.n ?? 0);
  if (!kws) {
    out.push({
      id: 'seo.import', title: 'Import a Search Console query export',
      detail: 'LaunchOS has no measured demand data for this project, so every keyword is currently a hypothesis.',
      area: 'seo', relevance: 80, effort: 'trivial',
      requiredAccess: 'Verified Search Console property.', costCategory: 'free_account_needed',
      strategicBenefit: 'Replaces guesses with what people actually searched for before reaching you.',
      verification: '"launchos seo keywords" shows rows marked "measured".',
      dependencies: ['verify.gsc'], score: 0,
    });
  }

  const proposed = d.all<{ title: string; page_type: string }>(
    "SELECT title, page_type FROM content_pages WHERE project_id = ? AND status = 'proposed' LIMIT 4", projectId
  );
  for (const p of proposed) {
    out.push({
      id: `content.${p.title.slice(0, 24)}`, title: `Write: ${p.title}`,
      detail: `A ${p.page_type.replace(/_/g, ' ')} proposed by content mapping because no existing page covered the cluster.`,
      area: 'content', relevance: 55, effort: 'medium',
      requiredAccess: 'Your own knowledge of the subject.', costCategory: 'free',
      strategicBenefit: 'A page that answers a real question is what both search engines and answer engines can cite.',
      verification: 'The page is published and appears in the next crawl.',
      dependencies: ['seo.import'], score: 0,
    });
  }

  for (const o of out) {
    const blocked = o.costCategory === 'paid_blocked' ? 0.1 : 1;
    o.score = Math.round(((o.relevance / EFFORT_COST[o.effort]) * blocked) * 10) / 10;
  }
  out.sort((a, b) => b.score - a.score);
  return ok(out);
}
