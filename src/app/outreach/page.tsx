import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { addProspectAction } from '@/app/actions';
import { listProspects, OPPORTUNITY_TYPES, draftOutreach } from '@/core/services/outreach';

export const metadata = { title: 'Outreach' };

export default async function OutreachPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const prospects = listProspects(d, project.id);

  return (
    <>
      <PageHeader
        title="Outreach"
        lede="One prospect at a time, with a stated reason and a stated basis for having their contact details."
      />

      <Note warn>
        Bulk outreach is refused by design. Each prospect needs a recorded basis for how you legitimately hold the
        contact channel, and LaunchOS never sends anything — it drafts, you send, then you record it.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Card title="Add a prospect">
          <ActionForm action={addProspectAction} submitLabel="Add prospect" resetOnSuccess>
            <Field label="Organization"><input className="input" name="organization" required /></Field>
            <Field label="Website"><input className="input" name="website" type="url" /></Field>
            <Field label="Contact channel" hint="Their published contact route. Never a guessed address.">
              <input className="input" name="contactChannel" placeholder="editorial@example.com or a contact form URL" />
            </Field>
            <Field label="How do you have this contact?" hint="Required. Scraped or guessed details are not accepted.">
              <input className="input" name="contactBasis" placeholder="published editorial contact on their contact page" required />
            </Field>
            <Field label="Opportunity type">
              <select className="select" name="opportunityType">
                {OPPORTUNITY_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Why would they specifically care?" hint="Required. If you cannot answer this, it is spam.">
              <textarea className="textarea" name="relevanceReason" required />
            </Field>
            <Field label="Source"><input className="input" name="source" placeholder="where you found them" /></Field>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {prospects.length ? (
            <>
              <Card title={`Prospects (${prospects.length})`}>
                <Table head={['Organization', 'Type', 'Status', 'Basis']}>
                  {prospects.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.organization}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{p.opportunityType.replace(/_/g, ' ')}</td>
                      <td><Badge kind={p.status === 'replied' ? 'pass' : 'unknown'}>{p.status}</Badge></td>
                      <td className="max-w-[16rem] text-xs" style={{ color: 'var(--text-dim)' }}>{p.contactBasis}</td>
                    </tr>
                  ))}
                </Table>
              </Card>
              {prospects.slice(0, 3).map((p) => {
                const draft = draftOutreach(d, p.id, 'press');
                if (!draft.ok) return null;
                return (
                  <Card key={p.id} title={`Draft for ${p.organization}`} subtitle={draft.value.subject}>
                    <pre className="code whitespace-pre-wrap">{draft.value.body}</pre>
                    {draft.value.warnings.length > 0 && (
                      <ul className="mt-3 flex flex-col gap-1 text-xs" style={{ color: '#b45309' }}>
                        {draft.value.warnings.map((w) => <li key={w}>! {w}</li>)}
                      </ul>
                    )}
                    <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
                      Send it yourself, then record it with <code>launchos outreach sent {p.id}</code>.
                    </p>
                  </Card>
                );
              })}
            </>
          ) : <Card title="Prospects"><Empty title="None yet" body="Add an organisation you have a genuine reason to contact." /></Card>}
        </div>
      </div>
    </>
  );
}
