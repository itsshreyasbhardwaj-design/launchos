import Link from 'next/link';
import { allProjects, activeProject, database } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { Card, Table, Badge, Empty } from '@/components/ui';
import { brandCompleteness } from '@/core/services/projects';
import { presetOf } from '@/core/presets';

export const metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  const projects = await allProjects();
  const active = await activeProject();
  const d = database();

  return (
    <>
      <PageHeader
        title="Projects"
        lede="One install runs as many projects as you like. Their records, audits and listings stay separate."
        actions={<Link href="/projects/new" className="btn btn-primary">New project</Link>}
      />
      <Card>
        {projects.length ? (
          <Table head={['Project', 'Preset', 'Status', 'Website', 'Brand profile', '']}>
            {projects.map((p) => {
              const c = brandCompleteness(d, p.id);
              return (
                <tr key={p.id}>
                  <td className="font-medium">
                    {p.name}
                    {active?.id === p.id && <span className="ml-2"><Badge kind="eligible">active</Badge></span>}
                  </td>
                  <td style={{ color: 'var(--text-dim)' }}>{presetOf(p.preset).label}</td>
                  <td><Badge kind={p.launchStatus === 'launched' || p.launchStatus === 'growing' ? 'pass' : 'unknown'}>{p.launchStatus.replace(/_/g, ' ')}</Badge></td>
                  <td className="max-w-[16rem] truncate">{p.websiteUrl ? <a className="link" href={p.websiteUrl} target="_blank" rel="noreferrer noopener">{p.websiteUrl}</a> : '—'}</td>
                  <td>
                    <Badge kind={c.missing.length ? 'fail' : c.unverified.length ? 'unknown' : 'pass'}>
                      {c.score}%{c.unverified.length ? ` · ${c.unverified.length} unverified` : ''}
                    </Badge>
                  </td>
                  <td><Link className="link" href={`/projects/${p.id}`}>Open</Link></td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty title="No projects" body="Create one to get started." cta={{ href: '/projects/new', label: 'New project' }} />
        )}
      </Card>
    </>
  );
}
