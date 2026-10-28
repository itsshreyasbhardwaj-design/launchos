import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { prepareAsoAction } from '@/app/actions';
import { listAso } from '@/core/services/channels';
import { j } from '@/core/db';

export const metadata = { title: 'App store' };

export default async function AsoPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const listings = listAso(database(), project.id);

  return (
    <>
      <PageHeader title="App store optimization" lede="Listing copy prepared against the documented store field limits." />
      <Note warn>
        Planning is free. Publishing is not: the Apple Developer Program charges an annual fee and Google Play a one-time
        registration fee. LaunchOS cannot publish an app and will never claim one is live without actual store approval.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card title="Prepare a listing">
          <ActionForm action={prepareAsoAction} submitLabel="Prepare">
            <Field label="Store">
              <select className="select" name="store" defaultValue="apple">
                <option value="apple">Apple App Store</option>
                <option value="google">Google Play</option>
              </select>
            </Field>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {listings.length ? listings.map((l) => {
            const findings = j.parse<string[]>(l.findings_json, []);
            return (
              <Card key={String(l.id)} title={String(l.store) === 'apple' ? 'Apple App Store' : 'Google Play'} subtitle={`Updated ${String(l.updated_at).slice(0, 10)}`}>
                <dl className="grid gap-2 text-[0.8125rem]">
                  {([['app_title', 'Title'], ['subtitle', 'Subtitle'], ['short_description', 'Short / promotional'], ['keyword_field', 'Keyword field'], ['long_description', 'Description']] as const).map(([k, label]) => {
                    const v = l[k];
                    if (!v) return null;
                    return (
                      <div key={k}>
                        <dt className="label">{label} ({String(v).length})</dt>
                        <dd className="whitespace-pre-wrap">{String(v)}</dd>
                      </div>
                    );
                  })}
                </dl>
                {findings.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1 border-t pt-3 text-xs" style={{ color: '#b45309' }}>
                    {findings.map((f) => <li key={f}>! {f}</li>)}
                  </ul>
                )}
              </Card>
            );
          }) : <Card title="Store listings"><Empty title="None prepared" body="Prepare one to see the copy built from your brand profile, trimmed to the store limits." /></Card>}
        </div>
      </div>
    </>
  );
}
