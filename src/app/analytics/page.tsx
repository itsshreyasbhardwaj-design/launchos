import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty, Stat, BarChart } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { importAnalyticsAction, recordConversionAction, buildUtmAction } from '@/app/actions';
import { dashboard, listUtm } from '@/core/services/analytics';

export const metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const dash = dashboard(d, project.id);
  const utms = listUtm(d, project.id);

  return (
    <>
      <PageHeader
        title="Analytics"
        lede="Imported, manually recorded and connected data are shown separately. A metric appears only when rows exist for it."
      />

      {dash.ok && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Impressions" value={dash.value.search?.impressions?.toLocaleString() ?? '—'} hint={dash.value.search ? `${dash.value.search.rows} imported row(s)` : 'Not imported'} />
            <Stat label="Clicks" value={dash.value.search?.clicks?.toLocaleString() ?? '—'} hint={dash.value.search?.ctr != null ? `CTR ${dash.value.search.ctr}%` : undefined} />
            <Stat label="Average position" value={dash.value.search?.avgPosition ?? '—'} hint="Mean of imported rows" />
            <Stat label="Recorded conversions" value={dash.value.conversions.reduce((a, c) => a + c.total, 0) || '—'} hint={dash.value.conversions.length ? `${dash.value.conversions.length} event type(s)` : 'None recorded'} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <div className="flex min-w-0 flex-col gap-4">
              {dash.value.topQueries.length > 0 && (
                <Card title="Top queries" subtitle="From your own Search Console export.">
                  <BarChart data={dash.value.topQueries.map((q) => ({ label: q.query, value: q.impressions ?? 0 }))} />
                  <div className="mt-4">
                    <Table head={['Query', 'Clicks', 'Impressions', 'Position']}>
                      {dash.value.topQueries.map((q) => (
                        <tr key={q.query}>
                          <td className="font-medium">{q.query}</td>
                          <td className="tabular-nums">{q.clicks ?? '—'}</td>
                          <td className="tabular-nums">{q.impressions ?? '—'}</td>
                          <td className="tabular-nums">{q.position ?? '—'}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </Card>
              )}

              {dash.value.topPages.length > 0 && (
                <Card title="Top pages">
                  <Table head={['Page', 'Clicks', 'Impressions']}>
                    {dash.value.topPages.map((p) => (
                      <tr key={p.url}>
                        <td className="max-w-[22rem] truncate font-mono text-xs">{p.url}</td>
                        <td className="tabular-nums">{p.clicks ?? '—'}</td>
                        <td className="tabular-nums">{p.impressions ?? '—'}</td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}

              <Card title="Growth surfaces" subtitle="Counted from verified records, not estimates.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="label">Listings</p>
                    <p className="text-[0.8125rem]">{dash.value.listings.live} live (verified) · {dash.value.listings.submitted} submitted · {dash.value.listings.prepared} prepared</p>
                  </div>
                  <div>
                    <p className="label">Content</p>
                    <p className="text-[0.8125rem]">{dash.value.content.published} existing · {dash.value.content.proposed} proposed</p>
                  </div>
                  <div>
                    <p className="label">Backlinks</p>
                    <p className="text-[0.8125rem]">{dash.value.backlinks.verified} confirmed on the page · {dash.value.backlinks.unverified} unverified</p>
                  </div>
                  <div>
                    <p className="label">AI visibility observations</p>
                    <p className="text-[0.8125rem]">{dash.value.aiVisibility.observations} recorded · {dash.value.aiVisibility.mentioned} mentioned · {dash.value.aiVisibility.cited} cited</p>
                  </div>
                </div>
              </Card>

              {dash.value.sources.length > 0 && (
                <Card title="Data sources">
                  <Table head={['Provider', 'Dimension', 'Rows', 'Imported']}>
                    {dash.value.sources.map((s, i) => (
                      <tr key={i}>
                        <td>{s.provider}</td>
                        <td style={{ color: 'var(--text-dim)' }}>{s.dimension}</td>
                        <td className="tabular-nums">{s.rows}</td>
                        <td>{s.importedAt.slice(0, 10)}</td>
                      </tr>
                    ))}
                  </Table>
                </Card>
              )}

              {!dash.value.hasData && (
                <Card title="Nothing measured yet">
                  <Empty title="No data" body="Import a Search Console or analytics export, or record a conversion you can actually count. LaunchOS will not fill this in with estimates." />
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <Card title="Import a CSV">
                <ActionForm action={importAnalyticsAction} submitLabel="Import">
                  <Field label="Provider"><input className="input" name="provider" placeholder="google_search_console, ga4, umami…" /></Field>
                  <Field label="Dimension">
                    <select className="select" name="dimension" defaultValue="page">
                      <option value="page">Page</option>
                      <option value="query">Query</option>
                      <option value="date">Date</option>
                      <option value="country">Country</option>
                      <option value="device">Device</option>
                      <option value="source">Source</option>
                    </select>
                  </Field>
                  <Field label="File"><input className="input" type="file" name="file" accept=".csv,text/csv" /></Field>
                  <Field label="…or paste"><textarea className="textarea" name="pasted" /></Field>
                </ActionForm>
              </Card>

              <Card title="Record a conversion">
                <ActionForm action={recordConversionAction} submitLabel="Record" variant="ghost" resetOnSuccess>
                  <Field label="Event name"><input className="input" name="eventName" placeholder="signup" required /></Field>
                  <Field label="Count"><input className="input" name="count" type="number" min={0} required /></Field>
                  <Field label="Date"><input className="input" name="eventDate" type="date" /></Field>
                  <Field label="Source"><input className="input" name="source" placeholder="product hunt" /></Field>
                </ActionForm>
              </Card>

              <Card title="UTM builder" subtitle="Consistent, URL-safe tracking links.">
                <ActionForm action={buildUtmAction} submitLabel="Build URL">
                  <Field label="Label"><input className="input" name="label" placeholder="PH launch day" /></Field>
                  <Field label="Destination URL"><input className="input" name="baseUrl" type="url" placeholder={project.websiteUrl ?? 'https://…'} required /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Source"><input className="input" name="source" placeholder="producthunt" required /></Field>
                    <Field label="Medium"><input className="input" name="medium" placeholder="referral" required /></Field>
                  </div>
                  <Field label="Campaign"><input className="input" name="campaign" placeholder="launch-week" required /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Content"><input className="input" name="content" /></Field>
                    <Field label="Term"><input className="input" name="term" /></Field>
                  </div>
                </ActionForm>
              </Card>

              {utms.length > 0 && (
                <Card title={`Tracking URLs (${utms.length})`}>
                  <ul className="flex flex-col gap-2 text-xs">
                    {utms.slice(0, 12).map((u) => (
                      <li key={String(u.id)}>
                        <p className="font-medium">{String(u.label)}</p>
                        <p className="break-all font-mono" style={{ color: 'var(--text-dim)' }}>{String(u.final_url)}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {dash.value.caveats.map((c) => <Note key={c} warn>{c}</Note>)}
            <Note warn>
              UTM attribution shows the last tagged click only. It does not prove that a channel caused a conversion, and
              LaunchOS does not claim otherwise anywhere in these numbers.
            </Note>
          </div>
        </>
      )}
    </>
  );
}
