import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm, ActionButton } from '@/components/action-form';
import { importSearchCsvAction, addKeywordsAction, deriveKeywordsAction, clusterKeywordsAction } from '@/app/actions';
import { listKeywords, listClusters } from '@/core/services/seo';

export const metadata = { title: 'Keywords' };

export default async function KeywordsPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const keywords = listKeywords(d, project.id);
  const clusters = listClusters(d, project.id);
  const measured = keywords.filter((k) => k.dataConfidence === 'measured').length;

  return (
    <>
      <PageHeader
        title="Keyword research"
        lede="Measured data comes from your own Search Console or Bing exports. Everything else is labelled a hypothesis."
      />

      <Note warn>
        LaunchOS never reports search volume, keyword difficulty or cost-per-click. No free source gives those reliably,
        and an invented number would quietly steer the whole plan wrong.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card title="Import search performance" subtitle="Performance → Queries → Export in Search Console.">
            <ActionForm action={importSearchCsvAction} submitLabel="Import CSV">
              <Field label="Provider">
                <select className="select" name="provider" defaultValue="google_search_console">
                  <option value="google_search_console">Google Search Console</option>
                  <option value="bing_webmaster">Bing Webmaster Tools</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="CSV file"><input className="input" type="file" name="file" accept=".csv,text/csv" /></Field>
              <Field label="…or paste the CSV"><textarea className="textarea" name="pasted" placeholder="Query,Clicks,Impressions,CTR,Position" /></Field>
            </ActionForm>
          </Card>

          <Card title="Add hypotheses">
            <ActionForm action={addKeywordsAction} submitLabel="Add keywords" variant="ghost" resetOnSuccess>
              <Field label="Keywords" hint="Comma or newline separated. Stored as hypotheses, with no invented metrics.">
                <textarea className="textarea" name="keywords" placeholder="task routing software, best task router for small teams" />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Derive from your own site">
            <ActionButton action={deriveKeywordsAction} label="Derive from crawl and brand profile" variant="ghost" />
            <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
              Reads page titles, headings and recorded features from the latest audit.
            </p>
          </Card>

          <Card title="Cluster">
            <ActionButton action={clusterKeywordsAction} label="Build clusters" />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card
            title={`Keywords (${keywords.length})`}
            subtitle={`${measured} with measured data, ${keywords.length - measured} hypotheses`}
          >
            {keywords.length ? (
              <Table head={['Keyword', 'Intent', 'Confidence', 'Impressions', 'Clicks', 'Position']}>
                {keywords.slice(0, 80).map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium">{k.keyword}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{k.intent.replace(/_/g, ' ')}</td>
                    <td><Badge kind={k.dataConfidence === 'measured' ? 'pass' : 'unknown'}>{k.dataConfidence === 'measured' ? 'measured' : 'hypothesis'}</Badge></td>
                    <td className="tabular-nums">{k.impressions?.toLocaleString() ?? '—'}</td>
                    <td className="tabular-nums">{k.clicks?.toLocaleString() ?? '—'}</td>
                    <td className="tabular-nums">{k.position ?? '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty title="No keywords yet" body="Import a Search Console export, add hypotheses, or derive candidates from your own site." />}
          </Card>

          {clusters.length > 0 && (
            <Card title={`Clusters (${clusters.length})`} subtitle="Keywords of different intent are never merged.">
              <div className="flex flex-col gap-4">
                {clusters.map((c) => (
                  <div key={c.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {c.label}
                      <Badge>{c.intent.replace(/_/g, ' ')}</Badge>
                      <Badge kind="info">{c.targetPageType.replace(/_/g, ' ')}</Badge>
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>{c.rationale}</p>
                    <p className="mt-1.5 text-[0.8125rem]">{c.keywords.join(' · ')}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
