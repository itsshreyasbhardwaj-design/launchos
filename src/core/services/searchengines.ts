import { logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, type Result } from '../util';
import { getProject, listDomains } from './projects';
import { safeFetch, assertSafeUrl } from '../net/safe-fetch';
import { latestAudit } from './audits';

/** Setup guidance and the one indexing integration that is genuinely free: IndexNow. */
export type SetupStep = { step: string; detail: string; done: boolean | null };

export function searchConsoleSetup(d: Db, projectId: string): Result<{ provider: string; steps: SetupStep[]; notes: string[] }> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const domains = listDomains(d, projectId);
  const audit = latestAudit(d, projectId);
  const verified = domains.some((x) => x.verifiedSearchConsole);

  return ok({
    provider: 'Google Search Console',
    steps: [
      { step: 'Add the property', detail: 'Use a Domain property (DNS TXT record) to cover every subdomain and protocol in one place. A URL-prefix property only covers that exact prefix.', done: verified ? true : null },
      { step: 'Verify ownership', detail: 'DNS TXT is the most durable method. HTML file and meta tag both break on redeploys.', done: verified },
      { step: 'Submit the sitemap', detail: audit?.sitemapUrls.length ? `Your crawl found ${audit.sitemapUrls.length} sitemap URL(s). Submit the sitemap index under Sitemaps.` : 'No sitemap found yet — publish one first.', done: audit ? audit.sitemapUrls.length > 0 : null },
      { step: 'Check index coverage', detail: 'Pages > Why pages are not indexed. "Crawled - currently not indexed" usually means a quality or duplication issue, not a technical one.', done: null },
      { step: 'Export query data', detail: 'Performance > Queries > Export. Then: launchos seo import <file.csv> --provider google_search_console', done: Number(d.get<{ n: number }>('SELECT COUNT(*) AS n FROM search_performance_imports WHERE project_id = ?', projectId)?.n ?? 0) > 0 },
      { step: 'Record verification in LaunchOS', detail: `launchos domains verified ${domains[0]?.host ?? '<host>'} --project ${project.slug} --search-console`, done: verified },
    ],
    notes: [
      'Search Console is free and needs only a Google account.',
      'HTTP availability is not index status. Only Search Console can tell you whether Google has actually indexed a URL.',
      'The Indexing API is for job postings and live-stream structured data only. Using it for ordinary pages is a misuse, and LaunchOS does not implement it.',
      'The UI export caps at 1000 rows. For more, use the Search Analytics API, which is also free.',
    ],
  });
}

export function bingSetup(d: Db, projectId: string): Result<{ provider: string; steps: SetupStep[]; notes: string[] }> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const domains = listDomains(d, projectId);
  const verified = domains.some((x) => x.verifiedBing);
  return ok({
    provider: 'Bing Webmaster Tools',
    steps: [
      { step: 'Add the site', detail: 'You can import the property straight from Google Search Console, which skips re-verification.', done: verified ? true : null },
      { step: 'Verify ownership', detail: 'DNS, XML file or meta tag.', done: verified },
      { step: 'Submit the sitemap', detail: 'Sitemaps > Submit sitemap.', done: null },
      { step: 'Configure the IndexNow key', detail: 'Bing Webmaster Tools generates an IndexNow key and hosts instructions for the key file.', done: domains.some((x) => x.indexnowKey) },
      { step: 'Record verification in LaunchOS', detail: `launchos domains verified ${domains[0]?.host ?? '<host>'} --project ${project.slug} --bing`, done: verified },
    ],
    notes: [
      'Free with a Microsoft account.',
      'Bing data also informs Copilot-facing surfaces, so it matters more than its search share suggests.',
    ],
  });
}

/**
 * IndexNow submission.
 *
 * Requires: an authorized domain, a key recorded for that domain, the key file
 * actually reachable at the host, and URLs on that host. A 200 from the
 * endpoint means the notification was accepted, NOT that anything was indexed —
 * the return value says so explicitly.
 */
export async function submitIndexNow(
  d: Db,
  projectId: string,
  urls: string[],
  opts: { endpoint?: string } = {}
): Promise<Result<{ accepted: boolean; status: number; submitted: number; meaning: string }>> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  if (!urls.length) return err('no URLs supplied');

  const domains = listDomains(d, projectId).filter((x) => x.authorized);
  if (!domains.length) return err('no authorized domain on this project. Authorize the host you control first.');

  const hosts = new Set<string>();
  for (const u of urls) {
    const safe = await assertSafeUrl(u);
    if (!safe.ok) return err(`URL rejected: ${safe.error}`);
    hosts.add(safe.value.host.toLowerCase().replace(/^www\./, ''));
  }
  if (hosts.size > 1) return err(`IndexNow accepts one host per request; got ${[...hosts].join(', ')}`);
  const host = [...hosts][0];
  const domain = domains.find((x) => x.host.replace(/^www\./, '') === host);
  if (!domain) return err(`host ${host} is not an authorized domain on this project`);

  const key = domain.indexnowKey || process.env.INDEXNOW_KEY;
  if (!key) {
    return err(
      `no IndexNow key recorded for ${host}. Generate one in Bing Webmaster Tools, host it at ` +
      `https://${host}/<key>.txt, then record it: launchos domains verified ${host} --project ${project.slug} --indexnow-key <key>`
    );
  }

  // Prove the key file is live before announcing anything: a missing key file
  // means every submission is silently rejected.
  const keyUrl = `https://${host}/${key}.txt`;
  const probe = await safeFetch(keyUrl, { maxBytes: 10_000, accept: 'text/plain,*/*' });
  if (!probe.ok || probe.value.status >= 400 || !probe.value.body.trim().startsWith(key)) {
    return err(
      `the IndexNow key file is not serving correctly at ${keyUrl} ` +
      `(${probe.ok ? `HTTP ${probe.value.status}, body starts "${probe.value.body.trim().slice(0, 24)}"` : probe.error}). ` +
      'Host the key file containing exactly the key before submitting.'
    );
  }

  const endpoint = opts.endpoint ?? 'https://api.indexnow.org/indexnow';
  const payload = { host, key, urlList: urls.slice(0, 10_000) };
  const runId = newId('run');
  d.run(
    `INSERT INTO automation_runs (id, project_id, job, trigger, status, started_at, idempotency_key) VALUES (?,?,?,?,?,?,?)`,
    runId, projectId, 'indexnow.submit', 'manual', 'running', nowIso(), `indexnow:${host}:${Date.now()}`
  );

  let status = 0;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    d.run("UPDATE automation_runs SET status = 'failed', finished_at = ?, summary = ? WHERE id = ?", nowIso(), msg, runId);
    return err(`IndexNow request failed: ${msg}`);
  }

  const accepted = status === 200 || status === 202;
  d.run(
    'UPDATE automation_runs SET status = ?, finished_at = ?, summary = ? WHERE id = ?',
    accepted ? 'succeeded' : 'failed', nowIso(), `HTTP ${status} for ${urls.length} URL(s)`, runId
  );
  logEvent(d, { projectId, actor: 'user', action: 'indexnow.submitted', detail: { host, status, count: urls.length } });

  return ok({
    accepted,
    status,
    submitted: urls.length,
    meaning: accepted
      ? 'The notification was accepted. That means the request was well-formed and the key checked out. It does NOT mean the URLs were indexed — only Search Console or Bing Webmaster Tools can tell you that.'
      : `The endpoint returned HTTP ${status}. 400 usually means a malformed request, 403 an invalid key, 422 a URL/host mismatch, 429 too many requests.`,
  });
}

export function discoveryChecklist(d: Db, projectId: string): Result<SetupStep[]> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const audit = latestAudit(d, projectId);
  const domains = listDomains(d, projectId);
  const has = (checkId: string): boolean | null => (audit ? !d.get('SELECT id FROM audit_findings WHERE audit_id = ? AND check_id = ?', audit.id, checkId) : null);

  return ok([
    { step: 'HTTPS', detail: 'Served over TLS with HTTP redirecting to it.', done: has('https.missing') },
    { step: 'Crawlable', detail: 'robots.txt does not block the pages you want found.', done: has('indexability.robots_blocked') },
    { step: 'Sitemap', detail: 'A readable XML sitemap exists and is referenced from robots.txt.', done: has('sitemap.missing') },
    { step: 'Canonical URLs', detail: 'Every indexable page declares an absolute self-referencing canonical.', done: has('canonical.missing') },
    { step: 'Indexable content', detail: 'No stray noindex directives.', done: has('indexability.noindex') },
    { step: 'Internal links', detail: 'Every page is reachable through real anchor elements.', done: has('links.no_internal') },
    { step: 'Search Console verification', detail: 'Ownership verified and recorded.', done: domains.some((x) => x.verifiedSearchConsole) },
    { step: 'Bing verification', detail: 'Ownership verified and recorded.', done: domains.some((x) => x.verifiedBing) },
    { step: 'Structured data', detail: 'Entity schema present and valid.', done: audit ? !!d.get('SELECT id FROM structured_data_results WHERE audit_id = ? AND valid = 1', audit.id) : null },
    { step: 'Monitoring', detail: 'Audits re-run on a schedule so regressions are caught.', done: Number(d.get<{ n: number }>("SELECT COUNT(*) AS n FROM automation_runs WHERE project_id = ? AND job = 'audit.scheduled'", projectId)?.n ?? 0) > 0 },
  ]);
}
