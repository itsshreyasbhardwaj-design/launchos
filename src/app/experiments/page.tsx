import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { createExperimentAction, analyzeExperimentAction, decideExperimentAction } from '@/app/actions';
import { listExperiments } from '@/core/services/analytics';
import { j } from '@/core/db';

export const metadata = { title: 'Experiments' };

export default async function ExperimentsPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const experiments = listExperiments(d, project.id);

  return (
    <>
      <PageHeader
        title="Growth experiments"
        lede="Hypothesis, change, metric, result. Significance is only claimed when the sample actually supports it."
      />

      <Note warn>
        A two-proportion z-test runs on your real counts. If the test is underpowered, LaunchOS reports the sample size
        you would need and refuses to call the result significant — even when p falls below 0.05.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <Card title="New experiment">
          <ActionForm action={createExperimentAction} submitLabel="Create" resetOnSuccess>
            <Field label="Hypothesis"><textarea className="textarea" name="hypothesis" placeholder="Removing the company field will increase signup completion." required /></Field>
            <Field label="Proposed change"><textarea className="textarea" name="change" placeholder="Remove the company field from the signup form." required /></Field>
            <Field label="Target metric"><input className="input" name="targetMetric" placeholder="signup completion rate" required /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starts"><input className="input" name="startsOn" type="date" /></Field>
              <Field label="Ends"><input className="input" name="endsOn" type="date" /></Field>
            </div>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {experiments.length ? experiments.map((e) => {
            const analysis = j.parse<Record<string, unknown>>(e.analysis_json, {});
            return (
              <Card
                key={String(e.id)}
                title={String(e.hypothesis)}
                subtitle={`${String(e.target_metric)} · ${String(e.status)}`}
              >
                <p className="text-[0.8125rem]"><span className="label">Change</span>{String(e.change_description)}</p>

                {Object.keys(analysis).length > 0 && (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.8125rem] sm:grid-cols-4">
                      <div><dt className="label">Baseline</dt><dd className="tabular-nums">{String(analysis.baselineRate ?? '—')}</dd></div>
                      <div><dt className="label">Variant</dt><dd className="tabular-nums">{String(analysis.variantRate ?? '—')}</dd></div>
                      <div><dt className="label">p value</dt><dd className="tabular-nums">{String(analysis.pValueTwoSided ?? '—')}</dd></div>
                      <div><dt className="label">Sample needed</dt><dd className="tabular-nums">{String(analysis.minimumSampleForDetection ?? '—')}</dd></div>
                    </dl>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.8125rem]">
                      <Badge kind={analysis.significantAt95 === true ? 'pass' : 'unknown'}>{analysis.significantAt95 === true ? 'significant' : 'not significant'}</Badge>
                      {String(analysis.verdict ?? '')}
                    </p>
                  </>
                )}

                <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                  <ActionForm action={analyzeExperimentAction} submitLabel="Analyse" variant="ghost">
                    <input type="hidden" name="experimentId" value={String(e.id)} />
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Baseline n"><input className="input" name="sampleBaseline" type="number" min={0} required /></Field>
                      <Field label="Baseline conv."><input className="input" name="conversionsBaseline" type="number" min={0} required /></Field>
                      <Field label="Variant n"><input className="input" name="sampleVariant" type="number" min={0} required /></Field>
                      <Field label="Variant conv."><input className="input" name="conversionsVariant" type="number" min={0} required /></Field>
                    </div>
                  </ActionForm>
                  <ActionForm action={decideExperimentAction} submitLabel="Record decision" variant="ghost">
                    <input type="hidden" name="experimentId" value={String(e.id)} />
                    <Field label="Decision"><input className="input" name="decision" placeholder="ship / revert / rerun with more traffic" required /></Field>
                    <Field label="Follow-up"><input className="input" name="followup" /></Field>
                  </ActionForm>
                </div>
                {Boolean(e.decision) && <p className="mt-2 text-[0.8125rem]"><span className="label">Decision</span>{String(e.decision)}</p>}
              </Card>
            );
          }) : <Card title="Experiments"><Empty title="None yet" body="Write down the hypothesis before you make the change. That is what makes the result mean something." /></Card>}
        </div>
      </div>
    </>
  );
}
