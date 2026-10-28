import { j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, type Result } from '../util';
import { runAudit, sortFindings, type AuditResult } from '../audit/engine';
import type { Finding } from '../audit/checks';
import { authorizedHosts, getProject } from './projects';

export type StoredAudit = {
  id: string;
  projectId: string;
  startUrl: string;
  status: 'running' | 'complete' | 'failed';
  pagesCrawled: number;
  pagesRequested: number;
  robotsStatus: string | null;
  sitemapUrls: string[];
  skipped: { url: string; reason: string }[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const EFFORT: Record<string, 'trivial' | 'small' | 'medium' | 'large'> = {
  trivial: 'trivial', small: 'small', medium: 'medium', large: 'large',
};

/**
 * Runs an audit for a project and stores every page, finding and piece of
 * evidence. The authorized-host list comes from the database, never from the
 * caller, so a web request cannot widen the crawl scope.
 */
export async function runProjectAudit(
  d: Db,
  projectId: string,
  opts: { maxPages?: number; maxDepth?: number; sitemapUrl?: string; runLighthouse?: boolean; onProgress?: (m: string) => void } = {}
): Promise<Result<{ auditId: string; result: AuditResult; tasksCreated: number }>> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  if (!project.websiteUrl) return err('this project has no website URL; set one before auditing');
  const hosts = authorizedHosts(d, projectId);
  if (!hosts.length) {
    return err(
      'no authorized domain for this project. Audits only run against hosts you have explicitly confirmed you control:\n' +
      `  launchos domains authorize ${new URL(project.websiteUrl).host} --project ${project.slug} --note "<how you control it>"`
    );
  }

  const auditId = newId('aud');
  const started = nowIso();
  d.run(
    `INSERT INTO site_audits (id, project_id, start_url, status, pages_crawled, pages_requested, started_at)
     VALUES (?,?,?,?,?,?,?)`,
    auditId, projectId, project.websiteUrl, 'running', 0, 0, started
  );

  const res = await runAudit({
    startUrl: project.websiteUrl,
    authorizedHosts: hosts,
    maxPages: opts.maxPages,
    maxDepth: opts.maxDepth,
    sitemapUrl: opts.sitemapUrl,
    runLighthouse: opts.runLighthouse,
    onProgress: opts.onProgress,
  });

  if (!res.ok) {
    d.run('UPDATE site_audits SET status = ?, error = ?, finished_at = ? WHERE id = ?', 'failed', res.error, nowIso(), auditId);
    logEvent(d, { projectId, actor: 'system', action: 'audit.failed', target: auditId, detail: { error: res.error } });
    return err(res.error);
  }
  const a = res.value;

  d.tx(() => {
    d.run(
      `UPDATE site_audits SET status=?, robots_status=?, robots_txt=?, sitemap_urls_json=?, pages_crawled=?,
       pages_requested=?, skipped_json=?, finished_at=? WHERE id=?`,
      'complete',
      a.robots ? `${a.robots.state} (HTTP ${a.robots.status})` : 'unreachable',
      a.robots?.raw?.slice(0, 20000) ?? null,
      j.stringify(a.sitemapUrls.slice(0, 500)),
      a.pages.length, a.requestedPages, j.stringify(a.skipped), nowIso(), auditId
    );

    for (const p of a.pages) {
      d.run(
        `INSERT INTO audit_pages (id, audit_id, url, final_url, status_code, redirect_chain_json, content_type, bytes,
         elapsed_ms, title, meta_description, canonical, meta_robots, h1_json, heading_outline_json, og_json,
         twitter_json, hreflang_json, lang, viewport, word_count, internal_links, external_links, images_total,
         images_missing_alt, jsonld_json, depth, from_sitemap, fetched_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId('pg'), auditId, p.url, p.finalUrl, p.status, j.stringify(p.redirectChain), p.contentType, p.bytes,
        p.elapsedMs, p.title ?? null, p.metaDescription ?? null, p.canonical ?? null, p.metaRobots ?? null,
        j.stringify(p.h1), j.stringify(p.headings), j.stringify(p.og), j.stringify(p.twitter),
        j.stringify(p.hreflang), p.lang ?? null, p.viewport ?? null, p.wordCount, p.internalLinks.length,
        p.links.filter((l) => !l.internal && l.absolute).length, p.images.length,
        p.images.filter((i) => !i.hasAlt).length, j.stringify(p.jsonLd.map((b) => b.parsed ?? b.raw.slice(0, 500))),
        0, 0, nowIso()
      );
    }

    for (const f of sortFindings(a.findings)) {
      d.run(
        `INSERT INTO audit_findings (id, audit_id, project_id, check_id, category, severity, page_url, title, evidence,
         impact_hypothesis, suggestion, complexity, verification, docs_url, fix_snippet, fix_language, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId('find'), auditId, projectId, f.checkId, f.category, f.severity, f.pageUrl ?? null, f.title,
        f.evidence, f.impactHypothesis, f.suggestion, f.complexity, f.verification, f.docsUrl ?? null,
        f.fixSnippet ?? null, f.fixLanguage ?? null, nowIso()
      );
    }

    for (const perf of a.performance) {
      d.run(
        `INSERT INTO performance_results (id, audit_id, url, source, measurement_kind, metrics_json, note, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        newId('perf'), auditId, perf.url, perf.result.source, perf.result.measurementKind,
        j.stringify(perf.result.metrics), perf.result.note, nowIso()
      );
    }

    for (const s of a.structured) {
      d.run(
        `INSERT INTO structured_data_results (id, audit_id, url, schema_type, valid, problems_json, raw, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        newId('sd'), auditId, s.url, s.types.join(',') || null, s.valid ? 1 : 0, j.stringify(s.problems), s.raw, nowIso()
      );
    }
  });

  const tasksCreated = generateSeoTasks(d, projectId, auditId, a.findings);
  logEvent(d, { projectId, actor: 'system', action: 'audit.completed', target: auditId, detail: { pages: a.pages.length, findings: a.findings.length } });
  return ok({ auditId, result: a, tasksCreated });
}

/** Turns findings into actionable, de-duplicated tasks. One task per check per page. */
export function generateSeoTasks(d: Db, projectId: string, auditId: string, findings: Finding[]): number {
  let created = 0;
  const ts = nowIso();
  d.tx(() => {
    for (const f of findings) {
      if (f.severity === 'info') continue;
      const ref = `${f.checkId}|${f.pageUrl ?? 'site'}`;
      const open = d.get<{ id: string }>(
        "SELECT id FROM seo_tasks WHERE project_id = ? AND source_ref = ? AND status IN ('open','in_progress')",
        projectId, ref
      );
      if (open) continue;
      d.run(
        `INSERT INTO seo_tasks (id, project_id, source, source_ref, title, detail, area, severity, effort, status, verification, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        newId('stask'), projectId, 'audit', ref, f.title,
        [
          f.pageUrl ? `Page: ${f.pageUrl}` : 'Scope: whole site',
          `Evidence: ${f.evidence}`,
          `Why it matters: ${f.impactHypothesis}`,
          `Do this: ${f.suggestion}`,
          f.docsUrl ? `Reference: ${f.docsUrl}` : '',
          f.fixSnippet ? `\nSuggested ${f.fixLanguage ?? 'code'}:\n${f.fixSnippet}` : '',
        ].filter(Boolean).join('\n'),
        f.category, f.severity, EFFORT[f.complexity] ?? 'medium', 'open', f.verification, ts, ts
      );
      created++;
    }
  });
  return created;
}

export function listAudits(d: Db, projectId: string): StoredAudit[] {
  return d.all<Record<string, unknown>>('SELECT * FROM site_audits WHERE project_id = ? ORDER BY started_at DESC', projectId).map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    startUrl: r.start_url as string,
    status: r.status as StoredAudit['status'],
    pagesCrawled: Number(r.pages_crawled ?? 0),
    pagesRequested: Number(r.pages_requested ?? 0),
    robotsStatus: (r.robots_status as string) ?? null,
    sitemapUrls: j.parse<string[]>(r.sitemap_urls_json, []),
    skipped: j.parse<{ url: string; reason: string }[]>(r.skipped_json, []),
    error: (r.error as string) ?? null,
    startedAt: r.started_at as string,
    finishedAt: (r.finished_at as string) ?? null,
  }));
}

export function latestAudit(d: Db, projectId: string): StoredAudit | null {
  return listAudits(d, projectId).find((a) => a.status === 'complete') ?? null;
}

export type StoredFinding = Finding & { id: string; auditId: string; createdAt: string };

export function listFindings(d: Db, auditId: string): StoredFinding[] {
  return d.all<Record<string, unknown>>('SELECT * FROM audit_findings WHERE audit_id = ?', auditId).map((r) => ({
    id: r.id as string,
    auditId: r.audit_id as string,
    checkId: r.check_id as string,
    category: r.category as Finding['category'],
    severity: r.severity as Finding['severity'],
    pageUrl: (r.page_url as string) ?? undefined,
    title: r.title as string,
    evidence: r.evidence as string,
    impactHypothesis: r.impact_hypothesis as string,
    suggestion: r.suggestion as string,
    complexity: r.complexity as Finding['complexity'],
    verification: r.verification as string,
    docsUrl: (r.docs_url as string) ?? undefined,
    fixSnippet: (r.fix_snippet as string) ?? undefined,
    fixLanguage: (r.fix_language as string) ?? undefined,
    createdAt: r.created_at as string,
  }));
}

export function auditPages(d: Db, auditId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM audit_pages WHERE audit_id = ? ORDER BY url', auditId);
}

export function performanceResults(d: Db, auditId: string): { url: string; source: string; measurementKind: string; metrics: Record<string, unknown>; note: string }[] {
  return d.all<Record<string, unknown>>('SELECT * FROM performance_results WHERE audit_id = ?', auditId).map((r) => ({
    url: r.url as string, source: r.source as string, measurementKind: r.measurement_kind as string,
    metrics: j.parse<Record<string, unknown>>(r.metrics_json, {}), note: r.note as string,
  }));
}

export function listSeoTasks(d: Db, projectId: string, status?: string): Record<string, unknown>[] {
  return status
    ? d.all('SELECT * FROM seo_tasks WHERE project_id = ? AND status = ? ORDER BY severity, created_at', projectId, status)
    : d.all('SELECT * FROM seo_tasks WHERE project_id = ? ORDER BY severity, created_at', projectId);
}

export function setSeoTaskStatus(d: Db, taskId: string, status: 'open' | 'in_progress' | 'done' | 'wont_do'): Result<{ id: string }> {
  const t = d.get<{ id: string }>('SELECT id FROM seo_tasks WHERE id = ?', taskId);
  if (!t) return err(`no SEO task ${taskId}`);
  d.run('UPDATE seo_tasks SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), taskId);
  return ok({ id: taskId });
}
