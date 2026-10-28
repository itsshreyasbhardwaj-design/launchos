import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Empty } from '@/components/ui';
import { landingPageAudit } from '@/core/services/channels';

export const metadata = { title: 'Conversion' };

export default async function CroPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const r = landingPageAudit(database(), project.id);

  return (
    <>
      <PageHeader title="Conversion review" lede="Traffic is not acquisition. This reviews what happens after someone arrives." />
      {r.ok ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.value.map((f) => (
            <Card key={f.area} title={<span className="flex items-center gap-2"><Badge kind={f.status}>{f.status}</Badge>{f.area}</span>}>
              <p className="text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>{f.evidence}</p>
              <p className="mt-2 text-[0.8125rem]">{f.suggestion}</p>
            </Card>
          ))}
        </div>
      ) : (
        <Card title="Conversion review">
          <Empty title="Needs crawl data" body={r.error} cta={{ href: '/audit', label: 'Run an audit' }} />
        </Card>
      )}
      <div className="mt-4">
        <Note warn>
          LaunchOS does not attempt to sign up to your product, so it cannot measure your funnel. Steps marked unknown
          are the ones only you can count.
        </Note>
      </div>
    </>
  );
}
