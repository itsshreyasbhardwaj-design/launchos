import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm, ActionButton } from '@/components/action-form';
import { addBacklinkAction, verifyBacklinksAction } from '@/app/actions';
import { listBacklinks, backlinkOpportunities, ALLOWED_BACKLINK_ORIGINS } from '@/core/services/outreach';

export const metadata = { title: 'Backlinks' };

export default async function BacklinksPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const links = listBacklinks(d, project.id);
  const opps = backlinkOpportunities(d, project.id);

  return (
    <>
      <PageHeader
        title="Backlinks"
        lede="Tracked only when the link is actually on the page. Verification fetches the source and looks for it."
        actions={links.length ? <ActionButton action={verifyBacklinksAction} label="Verify all" /> : undefined}
      />

      <Note warn>
        Purchased links, link farms, private blog networks, comment spam, hidden links and reciprocal schemes are
        rejected by the origin field. They do not get tracked here because they should not be pursued.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Card title="Record a backlink">
          <ActionForm action={addBacklinkAction} submitLabel="Record" resetOnSuccess>
            <Field label="Source URL" hint="The page that links to you."><input className="input" name="sourceUrl" type="url" required /></Field>
            <Field label="Target URL" hint="Your page."><input className="input" name="targetUrl" type="url" defaultValue={project.websiteUrl ?? ''} required /></Field>
            <Field label="Anchor text"><input className="input" name="anchor" /></Field>
            <Field label="Origin">
              <select className="select" name="origin" defaultValue="editorial">
                {ALLOWED_BACKLINK_ORIGINS.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {links.length ? (
            <Card title={`Recorded (${links.length})`}>
              <Table head={['Source', 'Origin', 'Confirmed', 'Last checked', 'HTTP']}>
                {links.map((l) => (
                  <tr key={String(l.id)}>
                    <td className="max-w-[20rem] truncate"><a className="link font-mono text-xs" href={String(l.source_url)} target="_blank" rel="noreferrer noopener">{String(l.source_url)}</a></td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(l.origin).replace(/_/g, ' ')}</td>
                    <td><Badge kind={l.verified ? 'pass' : 'unknown'}>{l.verified ? 'link present' : 'unverified'}</Badge></td>
                    <td className="text-xs">{String(l.last_checked ?? '—')}</td>
                    <td className="tabular-nums text-xs">{String(l.http_status ?? '—')}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : <Card title="Recorded links"><Empty title="None yet" body="Record a link once it exists. LaunchOS will confirm it is really on the page before counting it." /></Card>}

          {opps.ok && (
            <Card title="Opportunities" subtitle="Where relevant links plausibly come from — not a list of links to acquire.">
              <div className="flex flex-col gap-4">
                {opps.value.map((o) => (
                  <div key={o.strategy} className="border-t pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm font-semibold">{o.strategy}</p>
                    <p className="mt-1 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>{o.why}</p>
                    <p className="mt-1 text-[0.8125rem]"><span className="label">First step</span>{o.firstStep}</p>
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
