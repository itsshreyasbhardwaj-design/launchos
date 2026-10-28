import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field, Empty, Table } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { createBriefAction } from '@/app/actions';
import { listBriefs, briefToMarkdown, contentRefresh } from '@/core/services/content';
import { listClusters } from '@/core/services/seo';
import { presetOf } from '@/core/presets';

export const metadata = { title: 'Content Studio' };

export default async function ContentPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const briefs = listBriefs(d, project.id);
  const clusters = listClusters(d, project.id);
  const refresh = contentRefresh(d, project.id);
  const preset = presetOf(project.preset);

  return (
    <>
      <PageHeader
        title="Content Studio"
        lede="Briefs grounded in facts you have recorded, with unverified claims flagged rather than filled in."
      />

      <div className="grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card title="New brief">
            <ActionForm action={createBriefAction} submitLabel="Create brief">
              <Field label="From a keyword cluster" hint={clusters.length ? undefined : 'No clusters yet — cluster your keywords first, or enter a topic below.'}>
                <select className="select" name="clusterId" defaultValue="">
                  <option value="">— none —</option>
                  {clusters.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.keywords.length} kw)</option>)}
                </select>
              </Field>
              <Field label="…or a topic"><input className="input" name="topic" placeholder="reducing triage time" /></Field>
              <Field label="Content type">
                <select className="select" name="contentType" defaultValue="">
                  <option value="">— from the cluster —</option>
                  {preset.contentTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
            </ActionForm>
          </Card>

          <Note warn>
            LaunchOS will not invent a statistic, a customer result, a testimonial or a competitor weakness to fill an
            outline. Anything unverified is listed as needing verification.
          </Note>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {briefs.length ? briefs.map((b) => (
            <Card key={b.id} title={b.workingTitle} subtitle={`${b.contentType.replace(/_/g, ' ')} · ${b.searchIntent.replace(/_/g, ' ')}`}>
              <pre className="code max-h-96 overflow-y-auto whitespace-pre-wrap">{briefToMarkdown(b)}</pre>
            </Card>
          )) : (
            <Card title="Briefs"><Empty title="No briefs yet" body="Create one from a keyword cluster or a topic you already know matters." /></Card>
          )}

          {refresh.ok && refresh.value.length > 0 && (
            <Card title={`Refresh candidates (${refresh.value.length})`} subtitle="Published pages that have drifted, based on crawl and imported data.">
              <Table head={['Priority', 'Page', 'Issues']}>
                {refresh.value.slice(0, 20).map((r) => (
                  <tr key={r.url}>
                    <td><Badge kind={r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'medium' : 'low'}>{r.priority}</Badge></td>
                    <td className="max-w-[18rem] truncate font-mono text-xs">{r.url}</td>
                    <td>
                      <ul className="flex flex-col gap-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>
                        {r.issues.map((i) => <li key={i}>• {i}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
          {!refresh.ok && <Note>{refresh.error}</Note>}
        </div>
      </div>
    </>
  );
}
