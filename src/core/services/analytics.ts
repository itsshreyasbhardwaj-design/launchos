import { j, logEvent, type Db } from '../db';
import { err, fromCsv, newId, nowIso, ok, pct, sum, today, type Result } from '../util';
import { getProject } from './projects';

/**
 * Analytics, UTM and experiments.
 *
 * Every stored metric carries a `dataOrigin`: 'imported' (from a CSV export),
 * 'manual' (typed in by the operator) or 'connected' (a live authorized API).
 * Nothing is synthesised, and the dashboard shows a metric only where rows
 * actually exist.
 */
export type DataOrigin = 'imported' | 'manual' | 'connected';

export function importAnalyticsCsv(
  d: Db,
  projectId: string,
  csv: string,
  opts: { provider: string; dimension: 'page' | 'query' | 'country' | 'device' | 'date' | 'source'; filename?: string }
): Result<{ imported: number; skipped: number; importId: string; detectedColumns: string[] }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const rows = fromCsv(csv);
  if (!rows.length) return err('CSV contained no data rows');
  const detectedColumns = Object.keys(rows[0]);

  const norm = (k: string) => k.toLowerCase().replace(/[\s_]/g, '');
  const find = (row: Record<string, string>, names: string[]): string | undefined => {
    for (const n of names) {
      const hit = Object.keys(row).find((k) => norm(k) === n);
      if (hit && row[hit] !== '') return row[hit];
    }
    return undefined;
  };
  const num = (v: string | undefined): number | null => {
    if (v === undefined) return null;
    const n = Number(v.replace(/[%,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const dimNames: Record<string, string[]> = {
    page: ['page', 'toppages', 'landingpage', 'url', 'address', 'pages'],
    query: ['query', 'topqueries', 'keyword', 'queries'],
    country: ['country', 'countries'],
    device: ['device', 'devices', 'devicecategory'],
    date: ['date', 'day', 'dates'],
    source: ['source', 'sessionsource', 'referrer', 'sourcemedium'],
  };

  const importId = newId('aimp');
  let imported = 0;
  let skipped = 0;
  d.tx(() => {
    d.run(
      `INSERT INTO analytics_imports (id, project_id, provider, kind, filename, row_count, imported_at) VALUES (?,?,?,?,?,?,?)`,
      importId, projectId, opts.provider, opts.dimension, opts.filename ?? null, rows.length, nowIso()
    );
    for (const row of rows) {
      const value = find(row, dimNames[opts.dimension]);
      if (!value) { skipped++; continue; }
      const date = find(row, dimNames.date);
      d.run(
        `INSERT INTO traffic_metrics (id, project_id, import_id, data_origin, provider, metric_date, dimension,
         dimension_value, impressions, clicks, ctr, position, sessions, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId('tm'), projectId, importId, 'imported', opts.provider,
        opts.dimension === 'date' ? value : date ?? null, opts.dimension, value,
        num(find(row, ['impressions', 'impression'])), num(find(row, ['clicks', 'click'])),
        num(find(row, ['ctr', 'clickthroughrate'])), num(find(row, ['position', 'averageposition', 'avgposition'])),
        num(find(row, ['sessions', 'users', 'visits'])), nowIso()
      );
      imported++;
    }
  });
  logEvent(d, { projectId, actor: 'user', action: 'analytics.imported', detail: { provider: opts.provider, dimension: opts.dimension, imported, skipped } });
  return ok({ imported, skipped, importId, detectedColumns });
}

export function recordConversion(
  d: Db,
  projectId: string,
  input: { eventName: string; count: number; eventDate?: string; source?: string; note?: string }
): Result<{ id: string }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!Number.isFinite(input.count) || input.count < 0) return err('count must be a non-negative number');
  const id = newId('conv');
  d.run(
    `INSERT INTO conversion_events (id, project_id, data_origin, event_name, event_date, count, source, note, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, projectId, 'manual', input.eventName, input.eventDate ?? today(), Math.round(input.count),
    input.source ?? null, input.note ?? null, nowIso()
  );
  return ok({ id });
}

export type Dashboard = {
  hasData: boolean;
  sources: { provider: string; dimension: string; rows: number; importedAt: string }[];
  search: { impressions: number | null; clicks: number | null; ctr: number | null; avgPosition: number | null; rows: number } | null;
  topPages: { url: string; clicks: number | null; impressions: number | null }[];
  topQueries: { query: string; clicks: number | null; impressions: number | null; position: number | null }[];
  conversions: { eventName: string; total: number; origin: string }[];
  listings: { live: number; submitted: number; prepared: number };
  content: { published: number; proposed: number };
  backlinks: { verified: number; unverified: number };
  aiVisibility: { observations: number; mentioned: number; cited: number };
  caveats: string[];
};

/** Reads only what exists. Empty sections say so rather than showing a zero. */
export function dashboard(d: Db, projectId: string): Result<Dashboard> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const imports = d.all<Record<string, unknown>>('SELECT * FROM analytics_imports WHERE project_id = ? ORDER BY imported_at DESC', projectId);
  const searchRows = d.all<{ impressions: number | null; clicks: number | null; ctr: number | null; position: number | null }>(
    "SELECT impressions, clicks, ctr, position FROM traffic_metrics WHERE project_id = ? AND dimension IN ('query','page','date')", projectId
  );
  const caveats: string[] = [];

  const search = searchRows.length
    ? {
        impressions: sum(searchRows.map((r) => r.impressions ?? 0)) || null,
        clicks: sum(searchRows.map((r) => r.clicks ?? 0)) || null,
        ctr: null as number | null,
        avgPosition: (() => {
          const ps = searchRows.map((r) => r.position).filter((p): p is number => p != null);
          return ps.length ? Math.round((sum(ps) / ps.length) * 10) / 10 : null;
        })(),
        rows: searchRows.length,
      }
    : null;
  if (search && search.impressions && search.clicks) search.ctr = pct(search.clicks, search.impressions);
  if (search) {
    caveats.push(
      'Search totals are summed across every imported row. If you imported overlapping date ranges or several dimensions ' +
      'of the same data, they will double-count — the row count is shown so you can tell.'
    );
  } else {
    caveats.push('No search performance data imported yet. Export a Search Console or Bing Webmaster Tools CSV and import it.');
  }

  const topPages = d.all<{ dimension_value: string; clicks: number | null; impressions: number | null }>(
    "SELECT dimension_value, SUM(clicks) AS clicks, SUM(impressions) AS impressions FROM traffic_metrics WHERE project_id = ? AND dimension = 'page' GROUP BY dimension_value ORDER BY clicks DESC NULLS LAST LIMIT 10",
    projectId
  ).map((r) => ({ url: r.dimension_value, clicks: r.clicks, impressions: r.impressions }));

  const topQueries = d.all<{ dimension_value: string; clicks: number | null; impressions: number | null; position: number | null }>(
    "SELECT dimension_value, SUM(clicks) AS clicks, SUM(impressions) AS impressions, AVG(position) AS position FROM traffic_metrics WHERE project_id = ? AND dimension = 'query' GROUP BY dimension_value ORDER BY impressions DESC NULLS LAST LIMIT 10",
    projectId
  ).map((r) => ({ query: r.dimension_value, clicks: r.clicks, impressions: r.impressions, position: r.position ? Math.round(r.position * 10) / 10 : null }));

  const conversions = d.all<{ event_name: string; total: number; data_origin: string }>(
    'SELECT event_name, SUM(count) AS total, data_origin FROM conversion_events WHERE project_id = ? GROUP BY event_name, data_origin',
    projectId
  ).map((r) => ({ eventName: r.event_name, total: Number(r.total), origin: r.data_origin }));
  if (!conversions.length) caveats.push('No conversion events recorded. Record them with "launchos analytics conversion" or import them.');

  const countOf = (sql: string, ...p: unknown[]): number => Number(d.get<{ n: number }>(sql, ...p)?.n ?? 0);

  return ok({
    hasData: !!(searchRows.length || conversions.length),
    sources: imports.map((r) => ({ provider: r.provider as string, dimension: r.kind as string, rows: Number(r.row_count), importedAt: r.imported_at as string })),
    search,
    topPages,
    topQueries,
    conversions,
    listings: {
      live: countOf("SELECT COUNT(*) AS n FROM listing_drafts WHERE project_id = ? AND status = 'live'", projectId),
      submitted: countOf("SELECT COUNT(*) AS n FROM listing_drafts WHERE project_id = ? AND status IN ('submitted','pending_review')", projectId),
      prepared: countOf("SELECT COUNT(*) AS n FROM listing_drafts WHERE project_id = ? AND status IN ('content_ready','ready_for_submission')", projectId),
    },
    content: {
      published: countOf("SELECT COUNT(*) AS n FROM content_pages WHERE project_id = ? AND status = 'existing'", projectId),
      proposed: countOf("SELECT COUNT(*) AS n FROM content_pages WHERE project_id = ? AND status = 'proposed'", projectId),
    },
    backlinks: {
      verified: countOf('SELECT COUNT(*) AS n FROM backlinks WHERE project_id = ? AND verified = 1', projectId),
      unverified: countOf('SELECT COUNT(*) AS n FROM backlinks WHERE project_id = ? AND verified = 0', projectId),
    },
    aiVisibility: {
      observations: countOf('SELECT COUNT(*) AS n FROM ai_visibility_observations WHERE project_id = ?', projectId),
      mentioned: countOf('SELECT COUNT(*) AS n FROM ai_visibility_observations WHERE project_id = ? AND brand_mentioned = 1', projectId),
      cited: countOf('SELECT COUNT(*) AS n FROM ai_visibility_observations WHERE project_id = ? AND cited = 1', projectId),
    },
    caveats,
  });
}

// ---------------------------------------------------------------- UTM builder

const UTM_SAFE = /^[A-Za-z0-9._~-]+$/;
const SENSITIVE_WORD = /(email|e-mail|phone|mobile|address|dob|birth|password|passwd|secret|token|apikey|api_key|aadhaar|ssn|firstname|lastname|first_name|last_name|fullname|full_name|customer_name|username|user_name|userid|user_id)/i;

/** Heuristics for personal data in a campaign parameter, not just keyword matching. */
function looksPersonal(value: string): string | null {
  if (SENSITIVE_WORD.test(value)) return 'it contains a field name associated with personal data';
  if (value.includes('@')) return 'it contains "@", which usually means an email address';
  if (/\d{7,}/.test(value)) return 'it contains a long run of digits, which usually means a phone number or account id';
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(value)) return 'it looks like a government identifier';
  return null;
}

export function buildUtm(
  d: Db,
  projectId: string,
  input: { label: string; baseUrl: string; source: string; medium: string; campaign: string; content?: string; term?: string }
): Result<{ id: string; finalUrl: string; normalized: Record<string, string>; warnings: string[] }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  let base: URL;
  try {
    base = new URL(input.baseUrl);
  } catch {
    return err(`"${input.baseUrl}" is not a valid absolute URL`);
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return err(`unsupported scheme ${base.protocol}`);

  const warnings: string[] = [];
  const normalize = (raw: string, field: string): string => {
    const v = raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._~-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (v !== raw.trim().toLowerCase()) warnings.push(`${field} was normalized to "${v}" so the URL stays valid and consistent.`);
    if (!UTM_SAFE.test(v)) warnings.push(`${field} still contains unusual characters after normalization.`);
    return v;
  };

  for (const [field, value] of Object.entries({ source: input.source, medium: input.medium, campaign: input.campaign, content: input.content, term: input.term })) {
    if (!value) continue;
    const why = looksPersonal(value);
    if (why) {
      return err(
        `utm_${field} looks like it contains personal data ("${value}"): ${why}. Campaign parameters end up in analytics, ` +
        'logs, referrer headers and shared links. Never put personal data in a URL.'
      );
    }
  }

  const normalized: Record<string, string> = {
    utm_source: normalize(input.source, 'utm_source'),
    utm_medium: normalize(input.medium, 'utm_medium'),
    utm_campaign: normalize(input.campaign, 'utm_campaign'),
  };
  if (!normalized.utm_source || !normalized.utm_medium || !normalized.utm_campaign) {
    return err('utm_source, utm_medium and utm_campaign are all required and must contain at least one usable character');
  }
  if (input.content) normalized.utm_content = normalize(input.content, 'utm_content');
  if (input.term) normalized.utm_term = normalize(input.term, 'utm_term');

  for (const k of Object.keys(normalized)) base.searchParams.delete(k);
  for (const [k, v] of Object.entries(normalized)) base.searchParams.set(k, v);
  const finalUrl = base.toString();

  const id = newId('utm');
  d.run(
    `INSERT INTO utm_campaigns (id, project_id, label, base_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, final_url, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.label, input.baseUrl, normalized.utm_source, normalized.utm_medium,
    normalized.utm_campaign, normalized.utm_content ?? null, normalized.utm_term ?? null, finalUrl, nowIso()
  );
  warnings.push('UTM attribution only shows the last tagged click. It does not prove that this channel caused a conversion.');
  return ok({ id, finalUrl, normalized, warnings });
}

export function listUtm(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM utm_campaigns WHERE project_id = ? ORDER BY created_at DESC', projectId);
}

// ---------------------------------------------------------------- experiments

export function createExperiment(
  d: Db,
  projectId: string,
  input: { hypothesis: string; change: string; targetMetric: string; startsOn?: string; endsOn?: string; baselineValue?: number }
): Result<{ id: string }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!input.hypothesis.trim() || !input.change.trim() || !input.targetMetric.trim()) {
    return err('hypothesis, change and targetMetric are all required');
  }
  const id = newId('exp');
  const ts = nowIso();
  d.run(
    `INSERT INTO growth_experiments (id, project_id, hypothesis, change_description, target_metric, starts_on, ends_on,
     baseline_value, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.hypothesis.trim(), input.change.trim(), input.targetMetric.trim(),
    input.startsOn ?? today(), input.endsOn ?? null, input.baselineValue ?? null, 'planned', ts, ts
  );
  return ok({ id });
}

export type ExperimentAnalysis = {
  baselineRate: number | null;
  variantRate: number | null;
  absoluteDifference: number | null;
  relativeChange: number | null;
  zScore: number | null;
  pValueTwoSided: number | null;
  significantAt95: boolean;
  minimumSampleForDetection: number | null;
  verdict: string;
};

/**
 * Two-proportion z-test on real counts.
 *
 * Refuses to call anything significant without both sample sizes, and reports
 * the sample size that would be needed. An underpowered test that happens to
 * cross p<0.05 is noise, and saying otherwise would be the most harmful thing
 * this module could do.
 */
export function analyzeExperiment(
  d: Db,
  experimentId: string,
  input: { sampleBaseline: number; conversionsBaseline: number; sampleVariant: number; conversionsVariant: number }
): Result<ExperimentAnalysis> {
  const row = d.get<Record<string, unknown>>('SELECT * FROM growth_experiments WHERE id = ?', experimentId);
  if (!row) return err(`no experiment ${experimentId}`);
  const { sampleBaseline: nA, conversionsBaseline: xA, sampleVariant: nB, conversionsVariant: xB } = input;
  if ([nA, xA, nB, xB].some((v) => !Number.isFinite(v) || v < 0)) return err('all counts must be non-negative numbers');
  if (xA > nA || xB > nB) return err('conversions cannot exceed sample size');

  const analysis: ExperimentAnalysis = {
    baselineRate: null, variantRate: null, absoluteDifference: null, relativeChange: null,
    zScore: null, pValueTwoSided: null, significantAt95: false, minimumSampleForDetection: null,
    verdict: '',
  };

  if (nA === 0 || nB === 0) {
    analysis.verdict = 'Not analysable: one or both groups have no observations. There is nothing to compare.';
  } else {
    const pA = xA / nA;
    const pB = xB / nB;
    analysis.baselineRate = round(pA, 5);
    analysis.variantRate = round(pB, 5);
    analysis.absoluteDifference = round(pB - pA, 5);
    analysis.relativeChange = pA > 0 ? round((pB - pA) / pA, 4) : null;

    const pPool = (xA + xB) / (nA + nB);
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
    if (se > 0) {
      const z = (pB - pA) / se;
      analysis.zScore = round(z, 3);
      analysis.pValueTwoSided = round(2 * (1 - normalCdf(Math.abs(z))), 5);
    }

    // Sample size per group for 80% power at alpha=0.05, given the observed effect.
    const effect = Math.abs(pB - pA);
    if (effect > 0) {
      const pBar = (pA + pB) / 2;
      analysis.minimumSampleForDetection = Math.ceil((2 * pBar * (1 - pBar) * Math.pow(1.96 + 0.84, 2)) / Math.pow(effect, 2));
    }

    const underpowered = analysis.minimumSampleForDetection != null && (nA < analysis.minimumSampleForDetection || nB < analysis.minimumSampleForDetection);
    const pv = analysis.pValueTwoSided;

    if (pv != null && pv < 0.05 && !underpowered) {
      analysis.significantAt95 = true;
      analysis.verdict = `Significant at the 95% level (p=${pv}). ${pB > pA ? 'The variant converted better' : 'The variant converted worse'}: ${(pA * 100).toFixed(2)}% to ${(pB * 100).toFixed(2)}%.`;
    } else if (pv != null && pv < 0.05 && underpowered) {
      analysis.verdict =
        `p=${pv} crosses 0.05, but each group would need about ${analysis.minimumSampleForDetection} observations to detect ` +
        `an effect this size with 80% power, and you have ${nA} and ${nB}. LaunchOS does not call this significant — ` +
        'an underpowered result that crosses the threshold is usually noise.';
    } else {
      analysis.verdict =
        `Not significant (p=${pv ?? 'not computable'}). ` +
        (analysis.minimumSampleForDetection ? `About ${analysis.minimumSampleForDetection} observations per group would be needed to detect an effect this size.` : 'No difference was observed.');
    }
  }

  d.run(
    `UPDATE growth_experiments SET sample_baseline=?, conversions_baseline=?, sample_variant=?, conversions_variant=?,
     observed_value=?, analysis_json=?, status=?, updated_at=? WHERE id=?`,
    nA, xA, nB, xB, analysis.variantRate, j.stringify(analysis), 'analysed', nowIso(), experimentId
  );
  return ok(analysis);
}

export function decideExperiment(d: Db, experimentId: string, decision: string, followup?: string): Result<{ id: string }> {
  if (!d.get('SELECT id FROM growth_experiments WHERE id = ?', experimentId)) return err(`no experiment ${experimentId}`);
  d.run(
    "UPDATE growth_experiments SET decision = ?, followup = ?, status = 'closed', updated_at = ? WHERE id = ?",
    decision, followup ?? null, nowIso(), experimentId
  );
  return ok({ id: experimentId });
}

export function listExperiments(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM growth_experiments WHERE project_id = ? ORDER BY created_at DESC', projectId);
}

const round = (n: number, dp: number): number => Math.round(n * 10 ** dp) / 10 ** dp;

/** Abramowitz & Stegun 7.1.26 approximation of the standard normal CDF. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const cdf = 1 - (Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? cdf : 1 - cdf;
}
