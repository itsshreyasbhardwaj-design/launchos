import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Field, Table, Badge, Note, SeverityDots, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { runAuditAction } from '@/app/actions';
import { latestAudit, listAudits, listFindings, auditPages, performanceResults } from '@/core/services/audits';
import { listDomains } from '@/core/services/projects';
import { sortFindings } from '@/core/audit/engine';

export const metadata = { title: 'Site audit' };

export default async function AuditPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const audits = listAudits(d, project.id);
  const audit = latestAudit(d, project.id);
  const findings = audit ? sortFindings(listFindings(d, audit.id)) as ReturnType<typeof listFindings> : [];
  const pages = audit ? auditPages(d, audit.id) : [];
  const perf = audit ? performanceResults(d, audit.id) : [];
  const authorized = listDomains(d, project.id).filter((x) => x.authorized);
  const counts = findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.severity]: (a[f.severity] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader
        title="Site audit"
        lede="Crawls only hosts you have authorized, honours robots.txt, and reports evidence rather than a score."
      />

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card title="Run an audit">
            {authorized.length ? (
              <ActionForm action={runAuditAction} submitLabel="Run audit">
                <Field label="Max pages" hint="Hard-capped by LAUNCHOS_CRAWL_MAX_PAGES.">
                  <input className="input" name="maxPages" type="number" min={1} max={200} defaultValue={20} />
                </Field>
                <Field label="Crawl depth"><input className="input" name="maxDepth" type="number" min={0} max={4} defaultValue={2} /></Field>
                <Field label="Sitemap URL" hint="Optional. Otherwise read from robots.txt and /sitemap.xml.">
                  <input className="input" name="sitemapUrl" placeholder="https://acme.example/sitemap.xml" />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="lighthouse" /> Try Lighthouse if it is installed locally
                </label>
              </ActionForm>
            ) : (
              <Note warn>
                Auditing is blocked: no authorized domain. Authorize the host you control on the project page first.
              </Note>
            )}
            <p className="mt-4 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              Requests are spaced per host, every URL and redirect hop is checked against the SSRF guard, and a
              robots.txt server error stops the crawl rather than being treated as permission.
            </p>
          </Card>

          <Card title="Authorized hosts">
            {authorized.length
              ? <ul className="flex flex-col gap-1 font-mono text-xs">{authorized.map((x) => <li key={x.id}>{x.host}</li>)}</ul>
              : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>None.</p>}
          </Card>

          {audits.length > 0 && (
            <Card title="History">
              <Table head={['Started', 'Pages', 'Status']}>
                {audits.slice(0, 8).map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{a.startedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className="tabular-nums">{a.pagesCrawled}</td>
                    <td><Badge kind={a.status === 'complete' ? 'pass' : a.status === 'failed' ? 'fail' : 'unknown'}>{a.status}</Badge></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {!audit ? (
            <Card title="No completed audit">
              <Empty title="Nothing crawled yet" body="Run an audit to get findings backed by real responses from your own site." />
            </Card>
          ) : (
            <>
              <Card
                title={`${findings.length} finding(s)`}
                subtitle={`${audit.pagesCrawled} page(s) crawled of ${audit.pagesRequested} requested · robots.txt ${audit.robotsStatus ?? 'unknown'} · ${audit.sitemapUrls.length} sitemap URL(s)`}
              >
                <SeverityDots counts={counts} />
                {audit.skipped.length > 0 && (
                  <div className="mt-4">
                    <p className="label">Skipped URLs</p>
                    <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                      {audit.skipped.slice(0, 6).map((s) => <li key={s.url}><span className="font-mono">{s.url}</span> — {s.reason}</li>)}
                    </ul>
                  </div>
                )}
              </Card>

              {findings.map((f) => (
                <article key={f.id} className="card p-4">
                  <header className="flex flex-wrap items-center gap-2">
                    <Badge kind={f.severity}>{f.severity}</Badge>
                    <h3 className="text-[0.9375rem] font-semibold">{f.title}</h3>
                    <code className="text-xs" style={{ color: 'var(--text-dim)' }}>{f.checkId}</code>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-dim)' }}>{f.complexity} fix</span>
                  </header>
                  {f.pageUrl && (
                    <p className="mt-2 break-all font-mono text-xs">
                      <a className="link" href={f.pageUrl} target="_blank" rel="noreferrer noopener">{f.pageUrl}</a>
                    </p>
                  )}
                  <dl className="mt-3 grid gap-2 text-[0.8125rem]">
                    <div><dt className="label">Evidence</dt><dd className="whitespace-pre-wrap font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{f.evidence}</dd></div>
                    <div><dt className="label">Why it matters</dt><dd>{f.impactHypothesis}</dd></div>
                    <div><dt className="label">Do this</dt><dd>{f.suggestion}</dd></div>
                    <div><dt className="label">How to verify</dt><dd style={{ color: 'var(--text-dim)' }}>{f.verification}</dd></div>
                  </dl>
                  {f.fixSnippet && (
                    <div className="mt-3">
                      <p className="label">Suggested {f.fixLanguage ?? 'code'}</p>
                      <pre className="code">{f.fixSnippet}</pre>
                    </div>
                  )}
                  {f.docsUrl && (
                    <p className="mt-3 text-xs">
                      <a className="link" href={f.docsUrl} target="_blank" rel="noreferrer noopener">Reference documentation →</a>
                    </p>
                  )}
                </article>
              ))}

              {perf.length > 0 && (
                <Card title="Performance measurements" subtitle="Lab and server measurements are labelled separately from field data.">
                  {perf.map((r, i) => (
                    <div key={i} className="mb-4 last:mb-0">
                      <p className="text-sm font-medium">{r.source} <Badge>{r.measurementKind.replace(/_/g, ' ')}</Badge></p>
                      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                        {Object.entries(r.metrics).map(([k, v]) => (
                          <div key={k}><dt style={{ color: 'var(--text-dim)' }}>{k}</dt><dd className="tabular-nums font-medium">{String(v)}</dd></div>
                        ))}
                      </dl>
                      <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>{r.note}</p>
                    </div>
                  ))}
                </Card>
              )}

              {pages.length > 0 && (
                <Card title={`Crawled pages (${pages.length})`}>
                  <Table head={['URL', 'Status', 'Words', 'Title', 'Links']}>
                    {pages.map((p) => (
                      <tr key={String(p.id)}>
                        <td className="max-w-[20rem] truncate font-mono text-xs">{String(p.final_url)}</td>
                        <td><Badge kind={Number(p.status_code) < 400 ? 'pass' : 'fail'}>{String(p.status_code)}</Badge></td>
                        <td className="tabular-nums">{String(p.word_count)}</td>
                        <td className="max-w-[16rem] truncate">{String(p.title ?? '—')}</td>
                        <td className="tabular-nums">{String(p.internal_links)}</td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
