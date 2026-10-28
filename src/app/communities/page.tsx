import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { addCommunityAction } from '@/app/actions';
import { listCommunities } from '@/core/services/outreach';

export const metadata = { title: 'Communities' };

export default async function CommunitiesPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const communities = listCommunities(database(), project.id);

  return (
    <>
      <PageHeader
        title="Communities"
        lede="Record a community and its actual rules before planning anything there."
      />
      <Note warn>
        LaunchOS will not post to communities and will not generate promotional replies. A community cannot be recorded
        without its real self-promotion rules, because planning participation without reading them is how people get banned.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Card title="Add a community">
          <ActionForm action={addCommunityAction} submitLabel="Record community" resetOnSuccess>
            <Field label="Name"><input className="input" name="name" placeholder="r/selfhosted" required /></Field>
            <Field label="URL"><input className="input" name="url" type="url" /></Field>
            <Field label="Kind">
              <select className="select" name="kind" defaultValue="forum">
                {['forum', 'subreddit', 'discord', 'slack', 'mailing_list', 'professional_network', 'local_group'].map((k) => (
                  <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </Field>
            <Field label="Their self-promotion rules" hint="Quote or summarise what they actually say. At least a sentence.">
              <textarea className="textarea" name="selfPromotionRules" required />
            </Field>
            <Field label="Permitted formats"><input className="input" name="permittedFormats" placeholder="monthly thread, show-and-tell" /></Field>
            <Field label="Why is it relevant?"><input className="input" name="relevanceReason" /></Field>
          </ActionForm>
        </Card>

        <Card title={`Recorded (${communities.length})`}>
          {communities.length ? (
            <Table head={['Community', 'Kind', 'Rules verified', 'Rules']}>
              {communities.map((c) => (
                <tr key={String(c.id)}>
                  <td className="font-medium">{String(c.name)}</td>
                  <td style={{ color: 'var(--text-dim)' }}>{String(c.kind).replace(/_/g, ' ')}</td>
                  <td><Badge kind={c.rules_verified ? 'pass' : 'fail'}>{c.rules_verified ? 'yes' : 'no'}</Badge></td>
                  <td className="max-w-[22rem] text-xs" style={{ color: 'var(--text-dim)' }}>{String(c.self_promotion_rules)}</td>
                </tr>
              ))}
            </Table>
          ) : <Empty title="None yet" body="Add the communities where your audience already is, with their rules." />}
        </Card>
      </div>
    </>
  );
}
