import { j, logEvent, type Db } from '../db';
import { err, fromCsv, jaccard, newId, nowIso, ok, tokens, unique, type Result } from '../util';
import { presetOf } from '../presets';
import { getBrand, getProject } from './projects';
import { latestAudit } from './audits';

export type Intent = 'informational' | 'commercial_investigation' | 'transactional' | 'navigational' | 'local';
export type DataConfidence = 'measured' | 'provider_estimate' | 'qualitative_hypothesis';

export type KeywordOpportunity = {
  id: string;
  keyword: string;
  intent: Intent;
  source: string;
  dataConfidence: DataConfidence;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  position: number | null;
  volume: number | null;
  clusterId: string | null;
  note: string | null;
};

/** Heuristic intent classification. Transparent rules, no invented metrics. */
export function classifyIntent(keyword: string): Intent {
  const k = keyword.toLowerCase();
  if (/\b(near me|in [a-z]+|open now|nearby|directions)\b/.test(k)) return 'local';
  if (/\b(buy|price|pricing|cost|discount|coupon|subscribe|order|checkout|deal)\b/.test(k)) return 'transactional';
  if (/\b(best|top|vs|versus|alternative|alternatives|compare|comparison|review|reviews|cheapest|free)\b/.test(k)) return 'commercial_investigation';
  if (/\b(how|what|why|when|guide|tutorial|example|examples|learn|explain|difference)\b/.test(k)) return 'informational';
  return 'navigational';
}

/**
 * Imports a Search Console or Bing Webmaster Tools CSV export.
 *
 * Rows carry `dataConfidence: 'measured'` because they are your own measured
 * impressions and clicks. LaunchOS never writes a search-volume, difficulty or
 * CPC figure it did not receive from a real export.
 */
export function importSearchPerformance(
  d: Db,
  projectId: string,
  csv: string,
  opts: { provider: 'google_search_console' | 'bing_webmaster' | 'other'; filename?: string }
): Result<{ imported: number; skipped: number; importId: string; columns: string[] }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const rows = fromCsv(csv);
  if (!rows.length) return err('CSV contained no data rows');
  const columns = Object.keys(rows[0]);

  const pick = (row: Record<string, string>, names: string[]): string | undefined => {
    for (const n of names) {
      const hit = Object.keys(row).find((k) => k.toLowerCase().replace(/[\s_]/g, '') === n);
      if (hit && row[hit] !== '') return row[hit];
    }
    return undefined;
  };
  const num = (v: string | undefined): number | null => {
    if (v === undefined) return null;
    const cleaned = v.replace(/[%,\s]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  };

  const importId = newId('spi');
  let imported = 0;
  let skipped = 0;

  d.tx(() => {
    d.run(
      `INSERT INTO search_performance_imports (id, project_id, provider, kind, filename, row_count, imported_at)
       VALUES (?,?,?,?,?,?,?)`,
      importId, projectId, opts.provider, 'queries', opts.filename ?? null, rows.length, nowIso()
    );
    d.run(
      "DELETE FROM traffic_metrics WHERE project_id = ? AND provider = ? AND dimension = 'query'",
      projectId, opts.provider
    );
    for (const row of rows) {
      const keyword = (pick(row, ['query', 'topqueries', 'keyword', 'searchquery', 'queries']) ?? '').trim();
      if (!keyword) { skipped++; continue; }
      const impressions = num(pick(row, ['impressions', 'impression']));
      const clicks = num(pick(row, ['clicks', 'click']));
      const ctr = num(pick(row, ['ctr', 'clickthroughrate']));
      const position = num(pick(row, ['position', 'averageposition', 'avgposition']));
      d.run(
        `INSERT INTO keyword_opportunities (id, project_id, keyword, intent, source, data_confidence, impressions, clicks, ctr, position, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT (project_id, keyword) DO UPDATE SET
           impressions=excluded.impressions, clicks=excluded.clicks, ctr=excluded.ctr,
           position=excluded.position, source=excluded.source, data_confidence=excluded.data_confidence`,
        newId('kw'), projectId, keyword, classifyIntent(keyword), opts.provider, 'measured',
        impressions, clicks, ctr, position, nowIso()
      );
      // A query export is also query-dimension traffic data. Writing it to
      // traffic_metrics as well keeps the analytics dashboard reading from one
      // place; the import id lets a re-import replace rather than double-count.
      d.run(
        `INSERT INTO traffic_metrics (id, project_id, import_id, data_origin, provider, metric_date, dimension,
         dimension_value, impressions, clicks, ctr, position, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId('tm'), projectId, null, 'imported', opts.provider, null, 'query',
        keyword, impressions, clicks, ctr, position, nowIso()
      );
      imported++;
    }
  });
  logEvent(d, { projectId, actor: 'user', action: 'seo.import', detail: { provider: opts.provider, imported, skipped } });
  return ok({ imported, skipped, importId, columns });
}

/**
 * Adds operator-supplied keyword ideas. These are explicitly labelled
 * 'qualitative_hypothesis': no volume, no difficulty, no CPC, because none of
 * that is available from a free source we trust.
 */
export function addKeywordHypotheses(d: Db, projectId: string, keywords: string[], note = 'operator supplied'): Result<{ added: number }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  let added = 0;
  d.tx(() => {
    for (const raw of keywords) {
      const keyword = raw.trim().toLowerCase();
      if (!keyword) continue;
      d.run(
        `INSERT INTO keyword_opportunities (id, project_id, keyword, intent, source, data_confidence, note, created_at)
         VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (project_id, keyword) DO NOTHING`,
        newId('kw'), projectId, keyword, classifyIntent(keyword), 'operator', 'qualitative_hypothesis', note, nowIso()
      );
      added++;
    }
  });
  return ok({ added });
}

/** Derives candidate keywords from the project's own crawled content and brand facts. */
export function deriveKeywordsFromSite(d: Db, projectId: string): Result<{ added: number; from: string }> {
  const audit = latestAudit(d, projectId);
  const brand = getBrand(d, projectId);
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const candidates: string[] = [];

  if (audit) {
    const pages = d.all<{ title: string | null; heading_outline_json: string }>(
      'SELECT title, heading_outline_json FROM audit_pages WHERE audit_id = ?', audit.id
    );
    for (const p of pages) {
      if (p.title) candidates.push(p.title.replace(/\s*[|–—-]\s*[^|–—-]+$/, '').trim().toLowerCase());
      for (const h of j.parse<{ level: number; text: string }[]>(p.heading_outline_json, [])) {
        if (h.level <= 3 && h.text.length > 8 && h.text.length < 70) candidates.push(h.text.toLowerCase());
      }
    }
  }
  if (brand) {
    for (const f of brand.features) if (f.length > 5) candidates.push(f.toLowerCase());
    if (brand.problemsSolved) candidates.push(...brand.problemsSolved.split(/[.;\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 8));
  }

  const cleaned = unique(candidates.filter((c) => c.split(/\s+/).length >= 2 && c.length <= 80));
  const res = addKeywordHypotheses(d, projectId, cleaned, audit ? `derived from audit ${audit.id} and brand profile` : 'derived from brand profile');
  return res.ok
    ? ok({ added: res.value.added, from: audit ? 'site content + brand profile' : 'brand profile only (run an audit for better coverage)' })
    : res;
}

export function listKeywords(d: Db, projectId: string): KeywordOpportunity[] {
  return d.all<Record<string, unknown>>(
    'SELECT * FROM keyword_opportunities WHERE project_id = ? ORDER BY impressions DESC NULLS LAST, keyword', projectId
  ).map((r) => ({
    id: r.id as string, keyword: r.keyword as string, intent: r.intent as Intent, source: r.source as string,
    dataConfidence: r.data_confidence as DataConfidence,
    impressions: (r.impressions as number) ?? null, clicks: (r.clicks as number) ?? null,
    ctr: (r.ctr as number) ?? null, position: (r.position as number) ?? null, volume: (r.volume as number) ?? null,
    clusterId: (r.cluster_id as string) ?? null, note: (r.note as string) ?? null,
  }));
}

export type Cluster = { id: string; label: string; intent: Intent; keywords: string[]; targetPageType: string; rationale: string };

/**
 * Groups keywords by token overlap within an intent.
 *
 * Agglomerative single-link clustering on a Jaccard similarity of content
 * tokens. Keywords of different intent are never merged: "pricing" and
 * "how to" belong on different pages even when they share words.
 */
export function buildClusters(d: Db, projectId: string, threshold = 0.34): Result<Cluster[]> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const kws = listKeywords(d, projectId);
  if (!kws.length) return err('no keywords recorded yet; import a Search Console export or add hypotheses first');

  const clusters: { members: KeywordOpportunity[]; toks: string[]; intent: Intent }[] = [];
  for (const kw of kws) {
    const t = tokens(kw.keyword);
    let bestIdx = -1;
    let bestScore = 0;
    for (let idx = 0; idx < clusters.length; idx++) {
      const c = clusters[idx];
      if (c.intent !== kw.intent) continue;
      const score = Math.max(...c.members.map((m) => jaccard(tokens(m.keyword), t)));
      if (score >= threshold && score > bestScore) {
        bestIdx = idx;
        bestScore = score;
      }
    }
    if (bestIdx >= 0) {
      clusters[bestIdx].members.push(kw);
      clusters[bestIdx].toks = unique([...clusters[bestIdx].toks, ...t]);
    } else {
      clusters.push({ members: [kw], toks: t, intent: kw.intent });
    }
  }

  const preset = presetOf(project.preset);
  const out: Cluster[] = [];
  d.tx(() => {
    d.run('DELETE FROM keyword_clusters WHERE project_id = ?', projectId);
    for (const c of clusters) {
      const label = labelFor(c.members.map((m) => m.keyword));
      const pageType = pageTypeFor(c.intent, [label, ...c.members.map((m) => m.keyword)].join(' '), preset.contentTypes);
      const id = newId('clu');
      const measured = c.members.filter((m) => m.dataConfidence === 'measured');
      const rationale = measured.length
        ? `${c.members.length} keyword(s), ${measured.length} with measured Search Console data (${measured.reduce((a, m) => a + (m.impressions ?? 0), 0)} impressions total).`
        : `${c.members.length} keyword(s), all qualitative hypotheses — no measured demand data available, so treat the priority as unproven.`;
      d.run(
        `INSERT INTO keyword_clusters (id, project_id, label, intent, keyword_count, target_page_type, rationale, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        id, projectId, label, c.intent, c.members.length, pageType, rationale, nowIso()
      );
      for (const m of c.members) d.run('UPDATE keyword_opportunities SET cluster_id = ? WHERE id = ?', id, m.id);
      out.push({ id, label, intent: c.intent, keywords: c.members.map((m) => m.keyword), targetPageType: pageType, rationale });
    }
  });
  out.sort((a, b) => b.keywords.length - a.keywords.length);
  logEvent(d, { projectId, actor: 'system', action: 'seo.clustered', detail: { clusters: out.length, keywords: kws.length } });
  return ok(out);
}

function labelFor(keywords: string[]): string {
  const freq = new Map<string, number>();
  for (const k of keywords) for (const t of tokens(k)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([t]) => t);
  return top.join(' ') || keywords[0];
}

/** `text` is the cluster label plus every member keyword, so plurals and
 *  phrasing variants in the members still steer the page type. */
function pageTypeFor(intent: Intent, text: string, allowed: string[]): string {
  if (/\b(vs|versus|alternatives?|compared?|comparison)\b/.test(text) && allowed.includes('comparison')) return 'comparison';
  if (/\b(pricing|price|cost|how much)\b/.test(text)) return 'pricing_page';
  if (intent === 'transactional') return 'pricing_page';
  if (intent === 'local') return 'service_page';
  if (intent === 'navigational') return 'homepage_or_brand_page';
  if (intent === 'commercial_investigation') return allowed.includes('use_case_page') ? 'use_case_page' : 'feature_page';
  return allowed.includes('tutorial') ? 'tutorial' : 'how_to';
}

export function listClusters(d: Db, projectId: string): Cluster[] {
  const rows = d.all<Record<string, unknown>>('SELECT * FROM keyword_clusters WHERE project_id = ? ORDER BY keyword_count DESC', projectId);
  return rows.map((r) => ({
    id: r.id as string, label: r.label as string, intent: r.intent as Intent,
    keywords: d.all<{ keyword: string }>('SELECT keyword FROM keyword_opportunities WHERE cluster_id = ?', r.id as string).map((x) => x.keyword),
    targetPageType: (r.target_page_type as string) ?? 'unknown',
    rationale: (r.rationale as string) ?? '',
  }));
}

export type ContentMapRow = { cluster: Cluster; existingUrl: string | null; action: 'optimize_existing' | 'create_new'; reason: string };

/** Maps clusters onto pages the crawl actually found, so "create new" really means new. */
export function buildContentMap(d: Db, projectId: string): Result<ContentMapRow[]> {
  const clusters = listClusters(d, projectId);
  if (!clusters.length) return err('no clusters yet; run keyword clustering first');
  const audit = latestAudit(d, projectId);
  const pages = audit
    ? d.all<{ final_url: string; title: string | null; word_count: number }>(
        'SELECT final_url, title, word_count FROM audit_pages WHERE audit_id = ? AND status_code < 400', audit.id
      )
    : [];

  const rows: ContentMapRow[] = [];
  d.tx(() => {
    d.run('DELETE FROM content_pages WHERE project_id = ? AND status = ?', projectId, 'proposed');
    for (const c of clusters) {
      const ct = tokens(c.label + ' ' + c.keywords.slice(0, 5).join(' '));
      let best: { url: string; score: number; title: string } | null = null;
      for (const p of pages) {
        const score = Math.max(
          jaccard(tokens(p.title ?? ''), ct),
          jaccard(tokens(decodeURIComponent(new URL(p.final_url).pathname.replace(/[/-]/g, ' '))), ct)
        );
        if (!best || score > best.score) best = { url: p.final_url, score, title: p.title ?? '' };
      }
      const matched = best && best.score >= 0.3;
      const action: ContentMapRow['action'] = matched ? 'optimize_existing' : 'create_new';
      const reason = matched
        ? `"${best!.title || best!.url}" already covers this topic (token overlap ${(best!.score * 100).toFixed(0)}%). Strengthen it rather than publishing a near-duplicate.`
        : pages.length
          ? `No crawled page matched this cluster (best overlap ${best ? (best.score * 100).toFixed(0) : 0}%).`
          : 'No audit data available, so existing coverage is unknown. Run an audit before creating pages.';
      rows.push({ cluster: c, existingUrl: matched ? best!.url : null, action, reason });
      d.run(
        `INSERT INTO content_pages (id, project_id, url, page_type, title, status, cluster_id, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        newId('cpage'), projectId, matched ? best!.url : null, c.targetPageType,
        matched ? best!.title || c.label : `${c.label} (${c.targetPageType.replace(/_/g, ' ')})`,
        matched ? 'existing' : 'proposed', c.id, nowIso()
      );
    }
  });
  return ok(rows);
}

export type SeoStrategy = {
  project: string;
  preset: string;
  searchIntentFocus: string[];
  audience: string;
  topics: { label: string; intent: string; keywords: number; pageType: string; action: string; url: string | null }[];
  technicalFixes: { severity: string; title: string; pageUrl: string | null }[];
  internalLinking: string[];
  nextActions: string[];
  dataCaveats: string[];
};

/** Assembles a plan from stored evidence only. Anything unmeasured is named as such. */
export function seoStrategy(d: Db, projectId: string): Result<SeoStrategy> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const brand = getBrand(d, projectId);
  const preset = presetOf(project.preset);
  const map = buildContentMap(d, projectId);
  const clusters = map.ok ? map.value : [];
  const audit = latestAudit(d, projectId);
  const findings = audit
    ? d.all<{ severity: string; title: string; page_url: string | null }>(
        "SELECT severity, title, page_url FROM audit_findings WHERE audit_id = ? AND severity IN ('critical','high') ORDER BY severity", audit.id
      )
    : [];

  const caveats: string[] = [];
  const kws = listKeywords(d, projectId);
  const measured = kws.filter((k) => k.dataConfidence === 'measured').length;
  if (!kws.length) caveats.push('No keyword data at all. Import a Search Console export, or at minimum run "launchos seo derive".');
  else if (!measured) caveats.push(`All ${kws.length} keywords are qualitative hypotheses. There is no measured demand data behind this plan, so the ordering is a guess informed by your own content, not by observed search behaviour.`);
  else caveats.push(`${measured} of ${kws.length} keywords carry measured Search Console data; the rest are hypotheses.`);
  if (!audit) caveats.push('No completed audit. Existing-page coverage and technical fixes are unknown until you run one.');
  caveats.push('LaunchOS does not report search volume, keyword difficulty or CPC. Those numbers are not available from a free, reliable source, and inventing them would make this plan worse, not better.');

  const internalLinking: string[] = [];
  const pillars = clusters.filter((c) => c.cluster.keywords.length >= 3);
  for (const p of pillars.slice(0, 5)) {
    const children = clusters.filter((c) => c !== p && c.cluster.intent === p.cluster.intent).slice(0, 3);
    if (children.length) {
      internalLinking.push(`Make "${p.cluster.label}" the hub for ${p.cluster.intent.replace(/_/g, ' ')} and link it to: ${children.map((c) => c.cluster.label).join(', ')}.`);
    }
  }
  if (!internalLinking.length) internalLinking.push('Not enough clustered topics yet to propose a hub-and-spoke structure.');

  const nextActions: string[] = [];
  for (const f of findings.slice(0, 3)) nextActions.push(`Fix: ${f.title}${f.page_url ? ` (${f.page_url})` : ''}`);
  for (const c of clusters.filter((c) => c.action === 'create_new').slice(0, 3)) {
    nextActions.push(`Create a ${c.cluster.targetPageType.replace(/_/g, ' ')} for "${c.cluster.label}" (${c.cluster.keywords.length} keywords, no existing page matched).`);
  }
  for (const c of clusters.filter((c) => c.action === 'optimize_existing').slice(0, 2)) {
    nextActions.push(`Strengthen ${c.existingUrl} for "${c.cluster.label}" instead of publishing a new page.`);
  }
  if (!nextActions.length) nextActions.push('Run an audit and import search data; there is not enough evidence to recommend anything yet.');

  return ok({
    project: project.name,
    preset: preset.label,
    searchIntentFocus: preset.seoFocus,
    audience: brand?.targetAudience ?? 'Not recorded on the brand profile.',
    topics: clusters.map((c) => ({
      label: c.cluster.label, intent: c.cluster.intent, keywords: c.cluster.keywords.length,
      pageType: c.cluster.targetPageType, action: c.action, url: c.existingUrl,
    })),
    technicalFixes: findings.map((f) => ({ severity: f.severity, title: f.title, pageUrl: f.page_url })),
    internalLinking,
    nextActions,
    dataCaveats: caveats,
  });
}
