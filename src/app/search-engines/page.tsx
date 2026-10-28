import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { submitIndexNowAction } from '@/app/actions';
import { searchConsoleSetup, bingSetup, discoveryChecklist } from '@/core/services/searchengines';

export const metadata = { title: 'Search engines' };

function Steps({ steps }: { steps: { step: string; detail: string; done: boolean | null }[] }) {
  return (
    <div className="flex flex-col gap-3">
      {steps.map((s) => (
        <div key={s.step} className="flex gap-3">
          <Badge kind={s.done === true ? 'pass' : s.done === false ? 'fail' : 'unknown'}>
            {s.done === true ? 'done' : s.done === false ? 'todo' : 'unknown'}
          </Badge>
          <div className="min-w-0">
            <p className="text-sm font-medium">{s.step}</p>
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SearchEnginesPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const gsc = searchConsoleSetup(d, project.id);
  const bing = bingSetup(d, project.id);
  const checklist = discoveryChecklist(d, project.id);

  return (
    <>
      <PageHeader title="Search engine discovery" lede="Free setup, free verification, free data. No paid tier is involved anywhere on this page." />

      <div className="grid gap-4 lg:grid-cols-2">
        {gsc.ok && (
          <Card title={gsc.value.provider}>
            <Steps steps={gsc.value.steps} />
            <ul className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
              {gsc.value.notes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
          </Card>
        )}
        {bing.ok && (
          <Card title={bing.value.provider}>
            <Steps steps={bing.value.steps} />
            <ul className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
              {bing.value.notes.map((n) => <li key={n}>• {n}</li>)}
            </ul>
          </Card>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {checklist.ok && (
          <Card title="Website discovery checklist" subtitle="Derived from your latest audit and recorded verification state.">
            <Steps steps={checklist.value} />
          </Card>
        )}

        <div className="flex flex-col gap-4">
          <Card title="IndexNow" subtitle="Notify participating engines that a URL changed.">
            <ActionForm action={submitIndexNowAction} submitLabel="Submit URLs">
              <Field label="URLs" hint="One host per request, and the host must be authorized on this project.">
                <textarea className="textarea" name="urls" placeholder={`${project.websiteUrl ?? 'https://acme.example'}\n${project.websiteUrl ?? 'https://acme.example'}/pricing`} required />
              </Field>
            </ActionForm>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              LaunchOS first fetches your key file and checks it serves the key, because without that every submission is
              silently rejected.
            </p>
          </Card>
          <Note warn>
            An accepted IndexNow notification means the request was well-formed — not that anything was indexed. Only
            Search Console or Bing Webmaster Tools can tell you that.
          </Note>
          <Note warn>
            The Google Indexing API is for job postings and live-stream structured data only. LaunchOS does not implement
            it for ordinary pages, because that is a documented misuse.
          </Note>
        </div>
      </div>
    </>
  );
}
