import Link from 'next/link';
import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Stat, Badge, Note, SeverityDots, Table, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { runAuditAction } from './actions';
import { latestAudit, listFindings, listSeoTasks } from '@/core/services/audits';
import { sortFindings } from '@/core/audit/engine';
import { brandCompleteness, listDomains } from '@/core/services/projects';
import { dashboard } from '@/core/services/analytics';
import { launchReadiness, prioritize } from '@/core/services/readiness';
import { listListings } from '@/core/services/listings';
import { presetOf } from '@/core/presets';

export const metadata = { title: 'Command Center' };

export default async function CommandCenter() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();

  const audit = latestAudit(d, project.id);
  const findings = audit ? (sortFindings(listFindings(d, audit.id)) as ReturnType<typeof listFindings>) : [];
  const counts = findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.severity]: (a[f.severity] ?? 0) + 1 }), {});
  const openTasks = listSeoTasks(d, project.id, 'open');
  const completeness = brandCompleteness(d, project.id);
  const domains = listDomains(d, project.id);
  const dash = dashboard(d, project.id);
  const readiness = launchReadiness(d, project.id);
  const opps = prioritize(d, project.id);
  const listings = listListings(d, project.id);
  const preset = presetOf(project.preset);

  const authorized = domains.filter((x) => x.authorized);
  const live = listings.filter((l) => l.status === 'live').length;

  return (
    <>
      <PageHeader
        title={project.name}
        lede={`${preset.label} · ${project.launchStatus.replace(/_/g, ' ')}${project.country ? ` · ${project.country}` : ''}${project.websiteUrl ? ` · ${project.websiteUrl}` : ''}`}
        actions={<>
          <Link href="/opportunities" className="btn">What to do next</Link>
          <Link href="/audit" className="btn btn-primary">Run an audit</Link>
        </>}
      />

      {!authorized.length && (
        <div className="mb-6">
          <Note warn>
            No authorized domain yet, so auditing is blocked. LaunchOS only crawls hosts you have explicitly
            confirmed you control. <Link className="link" href={`/projects/${project.id}`}>Authorize a domain →</Link>
          </Note>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Audit findings"
          value={audit ? findings.length : '—'}
          hint={audit ? `${audit.pagesCrawled} page(s) crawled ${audit.startedAt.slice(0, 10)}` : 'No audit run yet'}
        />
        <Stat label="Open SEO tasks" value={openTasks.length} hint="Generated from real findings" />
        <Stat
          label="Brand profile"
          value={`${completeness.score}%`}
          hint={completeness.missing.length ? `${completeness.missing.length} field(s) missing` : completeness.unverified.length ? `${completeness.unverified.length} unverified` : 'Complete and verified'}
        />
        <Stat
          label="Listings live"
          value={live}
          hint={`${listings.length} prepared · only verified evidence counts`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Technical state"
          subtitle={audit ? `Audit ${audit.id.slice(0, 12)} · robots.txt ${audit.robotsStatus ?? 'unknown'}` : 'Nothing measured yet'}
          className="lg:col-span-2"
          actions={audit ? <Link href="/audit" className="btn btn-ghost">All findings</Link> : undefined}
        >
          {audit ? (
            <>
              <SeverityDots counts={counts} />
              <div className="mt-4">
                <Table head={['Severity', 'Finding', 'Page']}>
                  {findings.slice(0, 6).map((f) => (
                    <tr key={f.id}>
                      <td><Badge kind={f.severity}>{f.severity}</Badge></td>
                      <td className="font-medium">{f.title}</td>
                      <td className="max-w-[18rem] truncate" style={{ color: 'var(--text-dim)' }}>{f.pageUrl ?? 'site-wide'}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              <Empty
                title="No audit has run"
                body="Everything downstream — SEO tasks, GEO analysis, content mapping, readiness — reads from a real crawl of your own site. Run one first."
              />
              {authorized.length > 0 && (
                <ActionForm action={runAuditAction} submitLabel="Run the first audit">
                  <input type="hidden" name="maxPages" value="20" />
                  <input type="hidden" name="maxDepth" value="2" />
                </ActionForm>
              )}
            </div>
          )}
        </Card>

        <Card title="Next actions" subtitle="Ranked by relevance over effort">
          {opps.ok && opps.value.length ? (
            <ol className="flex flex-col gap-3">
              {opps.value.slice(0, 5).map((o, i) => (
                <li key={o.id} className="text-[0.8125rem]">
                  <span className="mr-1.5 font-semibold tabular-nums" style={{ color: 'var(--text-dim)' }}>{i + 1}.</span>
                  <span className="font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-xs" style={{ color: 'var(--text-dim)' }}>
                    {o.effort} effort · {o.costCategory.replace(/_/g, ' ')}
                  </span>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nothing to recommend yet.</p>}
          <Link href="/opportunities" className="btn btn-ghost mt-4 w-full justify-center">See all</Link>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Measured outcomes" subtitle="Only what has actually been imported or recorded" className="lg:col-span-2">
          {dash.ok && dash.value.hasData ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="label">Search performance (imported)</p>
                {dash.value.search ? (
                  <dl className="grid grid-cols-2 gap-y-1 text-sm">
                    <dt style={{ color: 'var(--text-dim)' }}>Impressions</dt><dd className="tabular-nums">{dash.value.search.impressions?.toLocaleString() ?? '—'}</dd>
                    <dt style={{ color: 'var(--text-dim)' }}>Clicks</dt><dd className="tabular-nums">{dash.value.search.clicks?.toLocaleString() ?? '—'}</dd>
                    <dt style={{ color: 'var(--text-dim)' }}>CTR</dt><dd className="tabular-nums">{dash.value.search.ctr ?? '—'}%</dd>
                    <dt style={{ color: 'var(--text-dim)' }}>Avg position</dt><dd className="tabular-nums">{dash.value.search.avgPosition ?? '—'}</dd>
                  </dl>
                ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Not imported.</p>}
              </div>
              <div>
                <p className="label">Recorded conversions</p>
                {dash.value.conversions.length ? (
                  <ul className="flex flex-col gap-1 text-sm">
                    {dash.value.conversions.map((c) => (
                      <li key={c.eventName} className="flex justify-between gap-3">
                        <span>{c.eventName}</span>
                        <span className="tabular-nums font-semibold">{c.total}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>None recorded.</p>}
              </div>
            </div>
          ) : (
            <Empty
              title="No measured data yet"
              body="LaunchOS shows a metric only when rows exist for it. Import a Search Console export, or record a conversion you can actually count."
              cta={{ href: '/analytics', label: 'Import data' }}
            />
          )}
        </Card>

        <Card title="Launch readiness" subtitle={readiness.ok ? `${readiness.value.overall.percentOfKnown}% of known criteria passing` : undefined}>
          {readiness.ok ? (
            <>
              <ul className="flex flex-col gap-2 text-[0.8125rem]">
                {readiness.value.areas.map((a) => (
                  <li key={a.area} className="flex items-center justify-between gap-3">
                    <span className="truncate">{a.area}</span>
                    <span className="shrink-0 tabular-nums" style={{ color: 'var(--text-dim)' }}>
                      {a.passed}/{a.passed + a.failed}{a.unknown ? ` +${a.unknown}?` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/readiness" className="btn btn-ghost mt-4 w-full justify-center">Full checklist</Link>
            </>
          ) : <p className="text-sm">{readiness.error}</p>}
        </Card>
      </div>

      {dash.ok && dash.value.caveats.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {dash.value.caveats.map((c) => <Note key={c} warn>{c}</Note>)}
        </div>
      )}
    </>
  );
}
