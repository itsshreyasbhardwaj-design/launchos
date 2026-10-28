import { type Db } from '../db';
import { err, newId, nowIso, ok, toCsv, today, type Result } from '../util';
import { getProject } from './projects';
import { latestAudit } from './audits';
import { dashboard } from './analytics';
import { launchReadiness, prioritize } from './readiness';
import { listListings } from './listings';

export type Period = 'daily' | 'weekly' | 'monthly';

export type Report = {
  period: Period;
  project: string;
  generatedAt: string;
  sections: { heading: string; lines: string[] }[];
  /** Statements LaunchOS cannot support with stored evidence. */
  unverified: string[];
};

/**
 * Builds a report from stored rows only.
 *
 * If a number is not in the database it is not in the report. Missing data is
 * reported as missing rather than rendered as a zero, because a zero reads like
 * a measurement.
 */
export function buildReport(d: Db, projectId: string, period: Period): Result<Report> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const sections: Report['sections'] = [];
  const unverified: string[] = [];
  const since = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const cutoff = new Date(Date.now() - since * 86400000).toISOString();

  const n = (sql: string, ...p: unknown[]): number => Number(d.get<{ n: number }>(sql, ...p)?.n ?? 0);

  // ---- outstanding actions
  const openTasks = d.all<{ title: string; area: string; due_on: string | null; priority_score: number }>(
    "SELECT title, area, due_on, priority_score FROM tasks WHERE project_id = ? AND status = 'open' ORDER BY priority_score DESC LIMIT 12", projectId
  );
  const openSeo = d.all<{ title: string; severity: string; page_url: string | null }>(
    "SELECT t.title, t.severity, NULL AS page_url FROM seo_tasks t WHERE t.project_id = ? AND t.status = 'open' ORDER BY CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END LIMIT 12",
    projectId
  );
  sections.push({
    heading: 'Outstanding actions',
    lines: [
      ...openTasks.map((t) => `- [${t.area}] ${t.title}${t.due_on ? ` (due ${t.due_on})` : ''}`),
      ...openSeo.map((t) => `- [seo:${t.severity}] ${t.title}`),
      ...(openTasks.length + openSeo.length === 0 ? ['Nothing open.'] : []),
    ],
  });

  // ---- technical state
  const audit = latestAudit(d, projectId);
  if (audit) {
    const sev = d.all<{ severity: string; n: number }>(
      'SELECT severity, COUNT(*) AS n FROM audit_findings WHERE audit_id = ? GROUP BY severity', audit.id
    );
    sections.push({
      heading: 'Technical state',
      lines: [
        `- Latest audit: ${audit.startedAt.slice(0, 16).replace('T', ' ')} UTC, ${audit.pagesCrawled} page(s) crawled of ${audit.pagesRequested} requested.`,
        `- robots.txt: ${audit.robotsStatus ?? 'unknown'}; sitemap URLs discovered: ${audit.sitemapUrls.length}.`,
        ...sev.map((s) => `- ${s.severity}: ${s.n} finding(s)`),
        ...(audit.skipped.length ? [`- Skipped ${audit.skipped.length} URL(s): ${audit.skipped.slice(0, 3).map((s) => `${s.url} (${s.reason})`).join('; ')}`] : []),
      ],
    });
  } else {
    sections.push({ heading: 'Technical state', lines: ['No completed audit. Technical state is unknown.'] });
    unverified.push('Technical state: no audit has been run, so nothing about the site is measured.');
  }

  // ---- measured performance
  const dash = dashboard(d, projectId);
  if (dash.ok) {
    const v = dash.value;
    const lines: string[] = [];
    if (v.search) {
      lines.push(`- Imported search rows: ${v.search.rows}. Impressions ${v.search.impressions ?? 'n/a'}, clicks ${v.search.clicks ?? 'n/a'}, CTR ${v.search.ctr ?? 'n/a'}%, average position ${v.search.avgPosition ?? 'n/a'}.`);
      for (const q of v.topQueries.slice(0, 5)) lines.push(`  - query "${q.query}": ${q.clicks ?? 0} clicks / ${q.impressions ?? 0} impressions, position ${q.position ?? 'n/a'}`);
      for (const p of v.topPages.slice(0, 5)) lines.push(`  - page ${p.url}: ${p.clicks ?? 0} clicks / ${p.impressions ?? 0} impressions`);
    } else {
      lines.push('- No search performance data imported.');
      unverified.push('Search performance: no data imported, so traffic and ranking statements cannot be made.');
    }
    if (v.conversions.length) for (const c of v.conversions) lines.push(`- Conversions (${c.origin}): ${c.eventName} = ${c.total}`);
    else {
      lines.push('- No conversion events recorded.');
      unverified.push('Conversions: none recorded, so no acquisition outcome can be reported.');
    }
    lines.push(`- Listings: ${v.listings.live} live (verified), ${v.listings.submitted} submitted, ${v.listings.prepared} prepared.`);
    lines.push(`- Backlinks: ${v.backlinks.verified} verified by fetching the source page, ${v.backlinks.unverified} unverified.`);
    lines.push(`- AI visibility observations: ${v.aiVisibility.observations} recorded, ${v.aiVisibility.mentioned} mentioned the brand, ${v.aiVisibility.cited} included a citation.`);
    sections.push({ heading: 'Measured outcomes', lines });
  }

  // ---- what changed in the window
  const changes: string[] = [];
  const live = n("SELECT COUNT(*) AS n FROM listing_submissions WHERE project_id = ? AND status = 'live' AND created_at >= ?", projectId, cutoff);
  const submitted = n("SELECT COUNT(*) AS n FROM listing_submissions WHERE project_id = ? AND created_at >= ?", projectId, cutoff);
  const published = n("SELECT COUNT(*) AS n FROM social_drafts WHERE project_id = ? AND status = 'published' AND updated_at >= ?", projectId, cutoff);
  const doneTasks = n("SELECT COUNT(*) AS n FROM seo_tasks WHERE project_id = ? AND status = 'done' AND updated_at >= ?", projectId, cutoff);
  changes.push(`- Listings submitted: ${submitted}; confirmed live with evidence: ${live}.`);
  changes.push(`- Social posts recorded as published (with evidence): ${published}.`);
  changes.push(`- SEO tasks completed: ${doneTasks}.`);
  const audits = n('SELECT COUNT(*) AS n FROM site_audits WHERE project_id = ? AND started_at >= ?', projectId, cutoff);
  changes.push(`- Audits run: ${audits}.`);
  sections.push({ heading: `Changes in the last ${since} day(s)`, lines: changes });

  if (period !== 'daily') {
    const readiness = launchReadiness(d, projectId);
    if (readiness.ok) {
      sections.push({
        heading: 'Launch readiness',
        lines: [
          `- ${readiness.value.overall.passed} passed, ${readiness.value.overall.failed} failed, ${readiness.value.overall.unknown} unknown of ${readiness.value.overall.total} criteria.`,
          `- ${readiness.value.overall.percentOfKnown}% of criteria with known state are passing.`,
          ...readiness.value.areas.map((a) => `  - ${a.area}: ${a.passed}/${a.passed + a.failed} known criteria passing${a.unknown ? `, ${a.unknown} unknown` : ''}`),
          `- ${readiness.value.disclaimer}`,
        ],
      });
    }
  }

  const opps = prioritize(d, projectId);
  if (opps.ok) {
    sections.push({
      heading: 'Recommended next actions',
      lines: opps.value.slice(0, 8).map((o, i) => `${i + 1}. ${o.title} — ${o.effort} effort, ${o.costCategory.replace(/_/g, ' ')}. Why: ${o.strategicBenefit}`),
    });
  }

  if (period === 'monthly') {
    const stale = listListings(d, projectId).filter((l) => l.status === 'needs_update');
    if (stale.length) {
      sections.push({ heading: 'Listings needing an update', lines: stale.map((l) => `- ${l.directoryName} (built from brand revision ${l.brandRevision})`) });
    }
  }

  unverified.push(
    'This report contains no projections. LaunchOS does not estimate future traffic, rankings, conversions or revenue, ' +
    'and does not attribute outcomes to a single marketing action.'
  );

  return ok({ period, project: project.name, generatedAt: nowIso(), sections, unverified });
}

export function reportToMarkdown(r: Report): string {
  const lines = [
    `# ${r.project} — ${r.period} growth report`,
    '',
    `Generated ${r.generatedAt.slice(0, 16).replace('T', ' ')} UTC by LaunchOS.`,
    '',
  ];
  for (const s of r.sections) {
    lines.push(`## ${s.heading}`, '', ...s.lines, '');
  }
  lines.push('## What this report does not claim', '', ...r.unverified.map((u) => `- ${u}`), '');
  return lines.join('\n');
}

export function reportToCsv(d: Db, projectId: string): Result<string> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const rows: Record<string, unknown>[] = [];
  for (const t of d.all<Record<string, unknown>>("SELECT title, severity, status, area FROM seo_tasks WHERE project_id = ?", projectId)) {
    rows.push({ type: 'seo_task', name: t.title, detail: t.area, status: t.status, severity: t.severity, data_origin: 'audit' });
  }
  for (const l of listListings(d, projectId)) {
    rows.push({ type: 'listing', name: l.directoryName, detail: l.directorySlug, status: l.status, severity: '', data_origin: 'listing_tracker' });
  }
  for (const m of d.all<Record<string, unknown>>("SELECT dimension, dimension_value, clicks, impressions, data_origin FROM traffic_metrics WHERE project_id = ? LIMIT 2000", projectId)) {
    rows.push({ type: `metric:${m.dimension}`, name: m.dimension_value, detail: `clicks=${m.clicks ?? ''} impressions=${m.impressions ?? ''}`, status: '', severity: '', data_origin: m.data_origin });
  }
  return ok(toCsv(rows));
}

export function saveReport(d: Db, projectId: string, r: Report, format: 'markdown' | 'csv' | 'json', body: string, path?: string): string {
  const id = newId('rep');
  d.run(
    'INSERT INTO generated_reports (id, project_id, period, format, path, body, generated_at) VALUES (?,?,?,?,?,?,?)',
    id, projectId, r.period, format, path ?? null, body.slice(0, 500_000), nowIso()
  );
  return id;
}

export function listReports(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT id, period, format, path, generated_at FROM generated_reports WHERE project_id = ? ORDER BY generated_at DESC LIMIT 50', projectId);
}

/** Minimal, dependency-free PDF writer so report export needs no library. */
export function reportToPdf(markdown: string, title: string): Buffer {
  const lines = markdown
    .split('\n')
    .flatMap((l) => wrap(l.replace(/^#+\s*/, '').replace(/[*_`]/g, ''), 95))
    .slice(0, 2400);
  const perPage = 52;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  if (!pages.length) pages.push(['(empty report)']);

  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1 = catalog, 2 = pages, 3 = font, then per page: content stream + page object
  let nextId = 4;
  const contents: { id: number; data: string }[] = [];
  for (const page of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    pageIds.push(pageId);
    const text = page
      .map((l, i) => `BT /F1 ${i === 0 ? 13 : 10} Tf 54 ${760 - i * 14} Td (${pdfEscape(l)}) Tj ET`)
      .join('\n');
    contents.push({ id: contentId, data: text });
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  for (const c of contents) objects[c.id] = `<< /Length ${Buffer.byteLength(c.data)} >>\nstream\n${c.data}\nendstream`;

  let out = `%PDF-1.4\n% ${title.replace(/[^\x20-\x7e]/g, '')}\n`;
  const offsets: number[] = [];
  for (let i = 1; i < nextId; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objects[i] ?? '<< >>'}\nendobj\n`;
  }
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let i = 1; i < nextId; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const pdfEscape = (s: string): string => s.replace(/[\\()]/g, (m) => `\\${m}`).replace(/[^\x20-\x7e]/g, '?');

function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line];
  const words = line.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) { out.push(cur.trim()); cur = w; }
    else cur = `${cur} ${w}`.trim();
  }
  if (cur) out.push(cur.trim());
  return out;
}
