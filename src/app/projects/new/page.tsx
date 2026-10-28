import { PageHeader } from '@/components/page-header';
import { Card, Field, Note } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { createProjectAction } from '@/app/actions';
import { PRESET_IDS, PRESETS } from '@/core/presets';

export const metadata = { title: 'New project' };

export default function NewProject() {
  return (
    <>
      <PageHeader
        title="New project"
        lede="Record what you know now. Nothing is guessed on your behalf, and you can change any of it later."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <Card title="Project details">
          <ActionForm action={createProjectAction} submitLabel="Create project">
            <Field label="Name"><input className="input" name="name" required placeholder="Acme Router" /></Field>
            <Field label="Website or app URL" hint="Public URL only. A private or internal address is rejected.">
              <input className="input" name="websiteUrl" type="url" placeholder="https://acme.example" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Growth preset" hint="Decides which channels and directories are prioritized.">
                <select className="select" name="preset" defaultValue="saas">
                  {PRESET_IDS.map((id) => <option key={id} value={id}>{PRESETS[id].label}</option>)}
                </select>
              </Field>
              <Field label="Launch status">
                <select className="select" name="launchStatus" defaultValue="pre_launch">
                  <option value="pre_launch">Pre-launch</option>
                  <option value="launched">Launched</option>
                  <option value="growing">Growing</option>
                  <option value="paused">Paused</option>
                </select>
              </Field>
            </div>
            <Field label="Category" hint="How you would describe it in a directory, e.g. “issue triage tool”.">
              <input className="input" name="category" placeholder="developer tooling" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Country" hint="ISO code, e.g. IN or US."><input className="input" name="country" maxLength={2} placeholder="IN" /></Field>
              <Field label="Market"><input className="input" name="market" placeholder="India, worldwide" /></Field>
            </div>
            <Field label="Marketing objectives">
              <textarea className="textarea" name="objectives" placeholder="What would make the next 90 days a success?" />
            </Field>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-3">
          <Note>
            Presets change the plan, not just the labels. A local business gets local listings and eligibility rules;
            a developer tool gets GitHub, docs and developer communities.
          </Note>
          <Card title="What happens next">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[0.8125rem]" style={{ color: 'var(--text-dim)' }}>
              <li>Authorize the domain you control, so auditing is allowed.</li>
              <li>Fill in the canonical brand profile — every listing and draft is built from it.</li>
              <li>Run an audit to get real, evidence-backed findings.</li>
              <li>Match directories, prepare listings, and approve what you want to publish.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
