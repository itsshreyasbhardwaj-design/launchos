import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { setLocalProfileAction } from '@/app/actions';
import { localChecklist } from '@/core/services/channels';

export const metadata = { title: 'Local SEO' };

export default async function LocalPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const checklist = localChecklist(d, project.id);
  const existing = d.get<Record<string, unknown>>('SELECT * FROM local_profiles WHERE project_id = ?', project.id);

  return (
    <>
      <PageHeader title="Local SEO" lede="Real locations only. Eligibility is assessed, not assumed." />
      <Note warn>
        Google Business Profile requires in-person customer contact during stated hours. An online-only product is not
        eligible, and LaunchOS will not suggest a workaround — inventing a location risks suspension and is dishonest.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[26rem_minmax(0,1fr)]">
        <Card title="Local business profile">
          <ActionForm action={setLocalProfileAction} submitLabel="Save profile">
            <Field label="Business name" hint="The real-world name on your signage. Adding keywords is a guidelines violation.">
              <input className="input" name="businessName" defaultValue={String(existing?.business_name ?? '')} required />
            </Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="servesCustomersInPerson" defaultChecked={existing?.serves_customers_in_person === 1} className="mt-0.5" />
              <span>We make in-person contact with customers during our stated hours</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Street"><input className="input" name="street" defaultValue={String(existing?.street ?? '')} /></Field>
              <Field label="City"><input className="input" name="city" defaultValue={String(existing?.city ?? '')} /></Field>
              <Field label="Region"><input className="input" name="region" defaultValue={String(existing?.region ?? '')} /></Field>
              <Field label="Postal code"><input className="input" name="postalCode" defaultValue={String(existing?.postal_code ?? '')} /></Field>
              <Field label="Country"><input className="input" name="country" defaultValue={String(existing?.country ?? '')} /></Field>
              <Field label="Phone"><input className="input" name="phone" defaultValue={String(existing?.phone ?? '')} /></Field>
            </div>
            <Field label="Service areas" hint="For a business that travels to customers instead of having a storefront.">
              <input className="input" name="serviceAreas" placeholder="Pune, Pimpri-Chinchwad" />
            </Field>
          </ActionForm>
        </Card>

        <Card title="Local checklist">
          {checklist.ok ? (
            <div className="flex flex-col gap-3">
              {checklist.value.map((c) => (
                <div key={c.item} className="flex gap-3">
                  <Badge kind={c.status}>{c.status.replace(/_/g, ' ')}</Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.item}</p>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title="No local profile" body={checklist.error} />}
        </Card>
      </div>
    </>
  );
}
