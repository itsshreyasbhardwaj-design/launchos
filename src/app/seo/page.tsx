import Link from 'next/link';
import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Empty, Field } from '@/components/ui';
import { ActionForm, ActionButton } from '@/components/action-form';
import { clusterKeywordsAction, setSeoTaskStatusAction } from '@/app/actions';
import { listSeoTasks } from '@/core/services/audits';
import { seoStrategy } from '@/core/services/seo';

export const metadata = { title: 'SEO Studio' };

export default async function SeoPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const strategy = seoStrategy(d, project.id);
  const open = listSeoTasks(d, project.id, 'open');
  const done = listSeoTasks(d, project.id, 'done');

  return (
    <>
      <PageHeader
        title="SEO Studio"
        lede="A plan assembled from your own crawl and your own search data. Where there is no data, it says so."
        actions={<Link href="/keywords" className="btn">Keywords</Link>}
      />

      {strategy.ok && (
        <div className="mb-4 flex flex-col gap-2">
          {strategy.value.dataCaveats.map((c) => <Note key={c} warn>{c}</Note>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title={`Open technical tasks (${open.length})`} subtitle="Generated from audit findings, de-duplicated per page and check.">
            {open.length ? (
              <Table head={['Severity', 'Task', 'Area', 'Effort', '']}>
                {open.map((t) => (
                  <tr key={String(t.id)}>
                    <td><Badge kind={String(t.severity)}>{String(t.severity)}</Badge></td>
                    <td>
                      <p className="font-medium">{String(t.title)}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-dim)' }}>Details and fix</summary>
                        <pre className="code mt-2 whitespace-pre-wrap">{String(t.detail)}</pre>
                      </details>
                    </td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(t.area)}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(t.effort)}</td>
                    <td>
                      <form action={setSeoTaskStatusAction}>
                        <input type="hidden" name="taskId" value={String(t.id)} />
                        <input type="hidden" name="status" value="done" />
                        <button className="btn btn-ghost" type="submit">Done</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty
                title="No open technical tasks"
                body="Either nothing is outstanding, or no audit has run yet. Tasks are only created from real findings."
                cta={{ href: '/audit', label: 'Run an audit' }}
              />
            )}
          </Card>

          {strategy.ok && strategy.value.topics.length > 0 && (
            <Card title="Topic plan" subtitle="Clusters mapped onto pages the crawl actually found.">
              <Table head={['Topic', 'Intent', 'Keywords', 'Page type', 'Action']}>
                {strategy.value.topics.map((t) => (
                  <tr key={t.label}>
                    <td className="font-medium">{t.label}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{t.intent.replace(/_/g, ' ')}</td>
                    <td className="tabular-nums">{t.keywords}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{t.pageType.replace(/_/g, ' ')}</td>
                    <td>
                      <Badge kind={t.action === 'create_new' ? 'unknown' : 'pass'}>{t.action.replace(/_/g, ' ')}</Badge>
                      {t.url && <p className="mt-1 max-w-[16rem] truncate font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{t.url}</p>}
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {done.length > 0 && (
            <Card title={`Completed (${done.length})`}>
              <ul className="flex flex-col gap-1 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>
                {done.slice(0, 15).map((t) => <li key={String(t.id)}>✓ {String(t.title)}</li>)}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Rebuild the plan">
            <ActionButton action={clusterKeywordsAction} label="Cluster keywords and map content" />
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              Groups keywords by token overlap within a single intent, then checks each cluster against crawled pages so
              “create new” really means new.
            </p>
          </Card>

          {strategy.ok && (
            <>
              <Card title="Next actions">
                <ol className="flex list-decimal flex-col gap-2 pl-5 text-[0.8125rem]">
                  {strategy.value.nextActions.map((a) => <li key={a}>{a}</li>)}
                </ol>
              </Card>
              <Card title="Internal linking">
                <ul className="flex flex-col gap-2 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>
                  {strategy.value.internalLinking.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </Card>
              <Card title="Context">
                <dl className="grid gap-1 text-[0.8125rem]">
                  <dt className="label">Preset</dt><dd>{strategy.value.preset}</dd>
                  <dt className="label mt-2">Audience</dt><dd>{strategy.value.audience}</dd>
                  <dt className="label mt-2">Intent focus</dt><dd>{strategy.value.searchIntentFocus.join(', ')}</dd>
                </dl>
              </Card>
            </>
          )}
          {!strategy.ok && <Note warn>{strategy.error}</Note>}
        </div>
      </div>
    </>
  );
}
