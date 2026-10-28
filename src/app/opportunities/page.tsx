import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note } from '@/components/ui';
import { prioritize } from '@/core/services/readiness';

export const metadata = { title: 'Opportunities' };

export default async function OpportunitiesPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const opps = prioritize(database(), project.id);

  return (
    <>
      <PageHeader
        title="Prioritized opportunities"
        lede="Ranked by relevance over effort, with blockers applied. Nothing here is a traffic or revenue forecast."
      />
      <Note warn>
        LaunchOS does not estimate expected traffic, conversion rate or ROI. Those numbers would be fabricated, and a
        fabricated forecast is worse than none — it would decide your priorities for you on invented evidence.
      </Note>

      <div className="mt-4 flex flex-col gap-3">
        {opps.ok ? opps.value.map((o, i) => (
          <article key={o.id} className="card p-4">
            <header className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-sm font-semibold" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
              <h2 className="text-[0.9375rem] font-semibold">{o.title}</h2>
              <Badge>{o.area.replace(/_/g, ' ')}</Badge>
              <Badge kind={o.effort === 'trivial' || o.effort === 'small' ? 'pass' : 'unknown'}>{o.effort} effort</Badge>
              <Badge kind={o.costCategory === 'free' ? 'free' : o.costCategory === 'paid_blocked' ? 'fail' : 'unknown'}>{o.costCategory.replace(/_/g, ' ')}</Badge>
              <span className="ml-auto text-xs tabular-nums" style={{ color: 'var(--text-dim)' }}>score {o.score}</span>
            </header>
            <p className="mt-2 whitespace-pre-wrap text-[0.8125rem]">{o.detail}</p>
            <dl className="mt-2 grid gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
              <div><dt className="inline font-semibold">Why it helps: </dt><dd className="inline">{o.strategicBenefit}</dd></div>
              <div><dt className="inline font-semibold">Access needed: </dt><dd className="inline">{o.requiredAccess}</dd></div>
              <div><dt className="inline font-semibold">How to verify: </dt><dd className="inline">{o.verification}</dd></div>
              {o.dependencies.length > 0 && <div><dt className="inline font-semibold">Depends on: </dt><dd className="inline">{o.dependencies.join(', ')}</dd></div>}
            </dl>
          </article>
        )) : <Card title="Nothing to prioritize"><p className="text-sm">{opps.error}</p></Card>}
      </div>
    </>
  );
}
