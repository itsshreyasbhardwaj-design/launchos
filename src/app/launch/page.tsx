import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field, Table } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { scheduleLaunchAction } from '@/app/actions';
import { buildPlaybook } from '@/core/services/launch';
import { presetOf } from '@/core/presets';

export const metadata = { title: 'Launch Center' };

export default async function LaunchPage({ searchParams }: { searchParams: Promise<{ playbook?: string }> }) {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const { playbook: requested } = await searchParams;
  const preset = presetOf(project.preset);
  const available = preset.launchPlaybooks;
  const selected = requested && available.includes(requested) ? requested : available[0];
  const pb = selected ? buildPlaybook(d, project.id, selected) : null;
  const tasks = d.all<Record<string, unknown>>(
    "SELECT * FROM tasks WHERE project_id = ? AND area = 'launch' ORDER BY due_on", project.id
  );

  return (
    <>
      <PageHeader
        title="Launch Center"
        lede="Preparation and readiness. LaunchOS never posts a launch, never asks for votes, and never coordinates engagement."
        actions={
          <nav className="flex flex-wrap gap-2">
            {available.map((p) => (
              <a key={p} href={`/launch?playbook=${p}`} className={`btn ${p === selected ? 'btn-primary' : ''}`}>
                {p.replace(/_/g, ' ')}
              </a>
            ))}
          </nav>
        }
      />

      {pb?.ok ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card title={pb.value.name} subtitle={pb.value.destination}>
              <div className="flex flex-col gap-2">
                {pb.value.policyNotes.map((n) => <Note key={n} warn>{n}</Note>)}
              </div>
            </Card>

            <Card title="Readiness" subtitle="Checked against real evidence where LaunchOS has it, and marked manual where only you can judge.">
              <div className="flex flex-col gap-3">
                {pb.value.readiness.map((r) => (
                  <div key={r.id} className="flex gap-3">
                    <Badge kind={r.status}>{r.status}</Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{r.label}</p>
                      <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {Object.keys(pb.value.copy).length > 0 && (
              <Card title="Prepared copy" subtitle="Built from your verified brand facts.">
                {Object.entries(pb.value.copy).map(([k, v]) => (
                  <div key={k} className="mb-4 last:mb-0">
                    <p className="label">{k.replace(/_/g, ' ')}</p>
                    <pre className="code whitespace-pre-wrap">{v}</pre>
                  </div>
                ))}
              </Card>
            )}

            <Card title="Schedule">
              {pb.value.schedule.map((s) => (
                <div key={`${s.phase}-${s.whenRelativeToLaunch}`} className="mb-4 last:mb-0">
                  <p className="text-sm font-semibold">{s.phase} <span className="font-normal" style={{ color: 'var(--text-dim)' }}>({s.whenRelativeToLaunch} days)</span></p>
                  <ul className="mt-1 flex flex-col gap-1 pl-4 text-[0.8125rem]">
                    {s.tasks.map((t) => <li key={t} className="list-disc">{t}</li>)}
                  </ul>
                </div>
              ))}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card title="Schedule this launch">
              <ActionForm action={scheduleLaunchAction} submitLabel="Create dated tasks">
                <input type="hidden" name="playbook" value={selected} />
                <Field label="Launch date"><input className="input" name="date" type="date" required /></Field>
              </ActionForm>
            </Card>
            <Card title="Assets required">
              <ul className="flex flex-col gap-1 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>
                {pb.value.assets.map((a) => <li key={a}>• {a}</li>)}
              </ul>
            </Card>
            <Card title="Automation boundary">
              <p className="text-[0.8125rem]">{pb.value.automationBoundary}</p>
            </Card>
            {tasks.length > 0 && (
              <Card title={`Launch tasks (${tasks.length})`}>
                <Table head={['Due', 'Task']}>
                  {tasks.slice(0, 20).map((t) => (
                    <tr key={String(t.id)}>
                      <td className="whitespace-nowrap text-xs">{String(t.due_on ?? '—')}</td>
                      <td className="text-[0.8125rem]">{String(t.title)}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <Card title="Playbook unavailable"><Note warn>{pb && !pb.ok ? pb.error : 'This preset has no launch playbooks.'}</Note></Card>
      )}
    </>
  );
}
