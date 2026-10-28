import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Stat } from '@/components/ui';
import { launchReadiness } from '@/core/services/readiness';

export const metadata = { title: 'Launch readiness' };

export default async function ReadinessPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const r = launchReadiness(database(), project.id);
  if (!r.ok) return <Card title="Readiness"><p className="text-sm">{r.error}</p></Card>;

  return (
    <>
      <PageHeader title="Launch readiness" lede="A transparent checklist. Every criterion shows its evidence and its fix." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Passing" value={r.value.overall.passed} hint={`of ${r.value.overall.total} criteria`} />
        <Stat label="Failing" value={r.value.overall.failed} />
        <Stat label="Unknown" value={r.value.overall.unknown} hint="Missing inputs, not failures" />
        <Stat label="Of known criteria" value={`${r.value.overall.percentOfKnown}%`} hint="Excludes unknowns" />
      </div>

      <div className="mt-4">
        <Note warn>{r.value.disclaimer}</Note>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {r.value.areas.map((a) => (
          <Card key={a.area} title={a.area} subtitle={`${a.passed}/${a.passed + a.failed} known criteria passing${a.unknown ? `, ${a.unknown} unknown` : ''}`}>
            <div className="flex flex-col gap-3">
              {a.criteria.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Badge kind={c.state}>{c.state}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{c.evidence}</p>
                    {c.state !== 'pass' && <p className="mt-0.5 text-xs" style={{ color: 'var(--accent)' }}>{c.fix}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
