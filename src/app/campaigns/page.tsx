import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { createCampaignAction } from '@/app/actions';
import { listCampaigns, CAMPAIGN_TEMPLATES, listPublishingTasks } from '@/core/services/launch';
import { j } from '@/core/db';

export const metadata = { title: 'Campaigns' };

export default async function CampaignsPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const campaigns = listCampaigns(d, project.id);
  const publishing = listPublishingTasks(d, project.id);

  return (
    <>
      <PageHeader title="Campaigns" lede="Multi-channel plans with an objective, a window and a recorded outcome." />

      <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card title="New campaign">
            <ActionForm action={createCampaignAction} submitLabel="Create campaign" resetOnSuccess>
              <Field label="Name"><input className="input" name="name" required /></Field>
              <Field label="Template">
                <select className="select" name="template" defaultValue="">
                  <option value="">— custom —</option>
                  {Object.keys(CAMPAIGN_TEMPLATES).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
              <Field label="Objective" hint="Required if no template is chosen."><textarea className="textarea" name="objective" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts"><input className="input" name="startsOn" type="date" /></Field>
                <Field label="Ends"><input className="input" name="endsOn" type="date" /></Field>
              </div>
              <Field label="Audience"><input className="input" name="audience" /></Field>
              <Field label="Region"><input className="input" name="region" /></Field>
              <Field label="Channels"><input className="input" name="channels" placeholder="product_hunt, linkedin, content" /></Field>
            </ActionForm>
          </Card>

          <Card title="Templates">
            <div className="flex flex-col gap-3 text-xs">
              {Object.entries(CAMPAIGN_TEMPLATES).map(([k, v]) => (
                <div key={k}>
                  <p className="text-[0.8125rem] font-semibold">{k.replace(/_/g, ' ')}</p>
                  <p style={{ color: 'var(--text-dim)' }}>{v.objective}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title={`Campaigns (${campaigns.length})`}>
            {campaigns.length ? (
              <Table head={['Name', 'Objective', 'Window', 'Channels', 'Status']}>
                {campaigns.map((c) => (
                  <tr key={String(c.id)}>
                    <td className="font-medium">{String(c.name)}</td>
                    <td className="max-w-[18rem]">{String(c.objective)}</td>
                    <td className="whitespace-nowrap text-xs" style={{ color: 'var(--text-dim)' }}>{String(c.starts_on ?? '—')} → {String(c.ends_on ?? '—')}</td>
                    <td className="text-xs">{j.parse<string[]>(c.channels_json, []).join(', ') || '—'}</td>
                    <td><Badge kind={String(c.status) === 'planned' ? 'unknown' : 'pass'}>{String(c.status)}</Badge></td>
                  </tr>
                ))}
              </Table>
            ) : <Empty title="No campaigns" body="Start from a template, or write your own objective." />}
          </Card>

          <Card title="Publishing approvals" subtitle="Anything that would reach the outside world waits here for a named approval.">
            {publishing.length ? (
              <Table head={['Kind', 'Destination', 'Status', 'Approved by']}>
                {publishing.map((t) => (
                  <tr key={String(t.id)}>
                    <td>{String(t.kind)}</td>
                    <td>{String(t.destination)}</td>
                    <td><Badge kind={String(t.status)}>{String(t.status).replace(/_/g, ' ')}</Badge></td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(t.approved_by ?? '—')}</td>
                  </tr>
                ))}
              </Table>
            ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Nothing awaiting approval.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
