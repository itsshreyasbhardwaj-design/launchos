import Link from 'next/link';
import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Note, Badge } from '@/components/ui';
import { MIGRATIONS } from '@/core/db/migrations';
import { listDomains } from '@/core/services/projects';

export const metadata = { title: 'Settings & privacy' };

export default async function SettingsPage() {
  const project = await activeProject();
  const d = database();
  const migrations = d.all<{ version: number; name: string; applied_at: string }>('SELECT * FROM schema_migrations ORDER BY version');
  const events = project
    ? d.all<Record<string, unknown>>('SELECT * FROM audit_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 30', project.id)
    : [];
  const domains = project ? listDomains(d, project.id) : [];

  return (
    <>
      <PageHeader title="Settings & privacy" lede="Where your data lives, what leaves this machine, and what LaunchOS refuses to do." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Storage">
          <dl className="grid gap-2 text-[0.8125rem]">
            <div><dt className="label">Database</dt><dd className="break-all font-mono text-xs">{d.path}</dd></div>
            <div><dt className="label">Engine</dt><dd>node:sqlite, built into Node — no native build, no database service, no account.</dd></div>
            <div><dt className="label">Migrations</dt><dd>{migrations.length} of {MIGRATIONS.length} applied</dd></div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
            Project records stay in this file. The default <code>data/</code> directory is gitignored, so private project
            plans cannot be committed by accident.
          </p>
        </Card>

        <Card title="What leaves this machine">
          <ul className="flex flex-col gap-2 text-[0.8125rem]">
            <li><Badge kind="pass">on your request</Badge> HTTP requests to hosts you authorized, during an audit.</li>
            <li><Badge kind="pass">on your request</Badge> One request per registry URL when you verify the directory list.</li>
            <li><Badge kind="pass">on your request</Badge> A fetch of a listing URL or backlink source when you ask for verification.</li>
            <li><Badge kind="pass">on your request</Badge> An IndexNow notification, only for an authorized host with a live key file.</li>
            <li><Badge kind="fail">never</Badge> Your project data, brand profile, analytics or plans. Nothing is sent anywhere.</li>
            <li><Badge kind="fail">never</Badge> Calls to an AI provider. LaunchOS needs no API key and spends no money.</li>
          </ul>
        </Card>

        <Card title="What LaunchOS refuses to do">
          <ul className="flex flex-col gap-1.5 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>
            <li>• Publish, post or submit anything on your behalf.</li>
            <li>• Send email or messages, in bulk or otherwise.</li>
            <li>• Solicit or coordinate upvotes, reviews or engagement.</li>
            <li>• Record a listing as live, or a post as published, without verifiable evidence.</li>
            <li>• Report search volume, keyword difficulty, CPC, or a traffic or revenue forecast.</li>
            <li>• Generate rating or review structured data.</li>
            <li>• Track purchased links, link farms, PBNs or comment spam.</li>
            <li>• Crawl a host you have not explicitly authorized, or any private network address.</li>
            <li>• Call an experiment significant when the sample does not support it.</li>
          </ul>
        </Card>

        <Card title="Data export and deletion">
          <p className="text-[0.8125rem]">
            Export every row LaunchOS holds for a project, or delete it entirely, from the CLI:
          </p>
          <pre className="code mt-2">{`launchos project export --project ${project?.slug ?? '<slug>'} --out export.json
launchos project delete --project ${project?.slug ?? '<slug>'} --yes`}</pre>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-dim)' }}>
            Deletion cascades: no orphan audit, listing or analytics rows survive.
          </p>
        </Card>

        {project && (
          <>
            <Card title="Crawl authorization" subtitle="The audit engine reads this list, not the request.">
              {domains.length ? (
                <Table head={['Host', 'Authorized', 'Note']}>
                  {domains.map((x) => (
                    <tr key={x.id}>
                      <td className="font-mono text-xs">{x.host}</td>
                      <td><Badge kind={x.authorized ? 'pass' : 'fail'}>{x.authorized ? 'yes' : 'no'}</Badge></td>
                      <td className="max-w-[18rem] text-xs" style={{ color: 'var(--text-dim)' }}>{x.authorizationNote}</td>
                    </tr>
                  ))}
                </Table>
              ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>None registered. <Link className="link" href={`/projects/${project.id}`}>Add one →</Link></p>}
            </Card>

            <Card title="Audit log" subtitle="Every state change that matters is recorded.">
              {events.length ? (
                <Table head={['When', 'Actor', 'Action', 'Target']}>
                  {events.map((e) => (
                    <tr key={String(e.id)}>
                      <td className="whitespace-nowrap text-xs">{String(e.created_at).slice(0, 16).replace('T', ' ')}</td>
                      <td className="text-xs">{String(e.actor)}</td>
                      <td className="font-mono text-xs">{String(e.action)}</td>
                      <td className="max-w-[14rem] truncate text-xs" style={{ color: 'var(--text-dim)' }}>{String(e.target ?? '')}</td>
                    </tr>
                  ))}
                </Table>
              ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No events yet.</p>}
            </Card>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Note>
          Behavioural session recording (Microsoft Clarity and similar) is listed in the tool registry but never wired in
          automatically. It records real visitors, so whether it is appropriate depends on your audience, your privacy
          policy and the provider&rsquo;s terms — that is your decision to make, not a default.
        </Note>
        <Note warn>
          If you host LaunchOS anywhere other than your own machine, put authentication in front of it. It holds
          unreleased plans and private business records, and it ships with no login because it is built to run locally.
        </Note>
      </div>
    </>
  );
}
