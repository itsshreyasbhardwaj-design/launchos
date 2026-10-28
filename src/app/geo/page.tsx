import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm, ActionButton } from '@/components/action-form';
import { recordVisibilityAction, checkEntityConsistencyAction, generateAiQueriesAction } from '@/app/actions';
import { geoAudit, listAiQueries, visibilityHistory, generateSchema, generateLlmsTxt } from '@/core/services/geo';

export const metadata = { title: 'GEO / AEO Studio' };

export default async function GeoPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const audit = geoAudit(d, project.id);
  const queries = listAiQueries(d, project.id);
  const history = visibilityHistory(d, project.id);
  const schema = generateSchema(d, project.id);
  const llms = generateLlmsTxt(d, project.id);
  const entity = d.all<Record<string, unknown>>('SELECT * FROM entity_consistency_checks WHERE project_id = ? ORDER BY source_label', project.id);

  return (
    <>
      <PageHeader
        title="GEO / AEO Studio"
        lede="Generative and answer engine optimization: whether your site states its own facts in a form an answer engine can use."
      />

      <Note warn>
        This measures your site, not any provider&rsquo;s ranking. Nobody can guarantee inclusion in an AI answer, and
        LaunchOS will not pretend to model one. AI visibility is tracked only through dated observations you record.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {audit.ok ? (
            <Card
              title="AI discoverability audit"
              subtitle={`${audit.value.pagesExamined} page(s) examined · ${audit.value.score.passed} pass, ${audit.value.score.failed} fail, ${audit.value.score.unknown} unknown`}
            >
              <div className="flex flex-col gap-4">
                {audit.value.checks.map((c) => (
                  <div key={c.id} className="border-t pt-3 first:border-t-0 first:pt-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <Badge kind={c.status}>{c.status}</Badge>
                      {c.requirement}
                    </p>
                    <dl className="mt-2 grid gap-1.5 text-[0.8125rem]">
                      <div><dt className="label">Evidence</dt><dd style={{ color: 'var(--text-dim)' }}>{c.evidence}</dd></div>
                      <div><dt className="label">Why</dt><dd>{c.why}</dd></div>
                      {c.status !== 'pass' && <div><dt className="label">Fix</dt><dd>{c.fix}</dd></div>}
                    </dl>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <Card title="AI discoverability audit">
              <Empty title="Needs crawl data" body={audit.error} cta={{ href: '/audit', label: 'Run an audit' }} />
            </Card>
          )}

          {schema.ok && (
            <Card title="Structured data" subtitle={`Generated from verified facts only: ${schema.value.types.join(', ')}`}>
              <pre className="code">{schema.value.jsonLd}</pre>
              <div className="mt-3">
                <p className="label">Deliberately omitted</p>
                <ul className="flex flex-col gap-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  {schema.value.omitted.map((o) => <li key={o}>• {o}</li>)}
                </ul>
              </div>
            </Card>
          )}

          {entity.length > 0 && (
            <Card title="Brand entity consistency" subtitle="Compares your canonical facts against the public records you control.">
              <Table head={['Field', 'Source', 'Status', 'Observed']}>
                {entity.map((r) => (
                  <tr key={String(r.id)}>
                    <td className="font-medium">{String(r.field)}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{String(r.source_label)}</td>
                    <td><Badge kind={String(r.status) === 'consistent' ? 'pass' : 'fail'}>{String(r.status)}</Badge></td>
                    <td className="max-w-[20rem] text-xs" style={{ color: 'var(--text-dim)' }}>{String(r.observed_value ?? '')}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {llms.ok && (
            <Card title="llms.txt (experimental)">
              <pre className="code max-h-72 overflow-y-auto">{llms.value.content}</pre>
              <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>{llms.value.disclaimer}</p>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="AI search query library" subtitle="Run these yourself, then record what you saw.">
            <ActionButton action={generateAiQueriesAction} label="Generate queries" variant="ghost" />
            {queries.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {queries.map((q) => (
                  <li key={q.id} className="text-[0.8125rem]">
                    <p className="font-medium">&ldquo;{q.query}&rdquo;</p>
                    <p className="mt-0.5 text-xs" style={{ color: 'var(--text-dim)' }}>{q.rationale}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Record an observation" subtitle="A dated, sourced note of one real answer.">
            <ActionForm action={recordVisibilityAction} submitLabel="Record observation" resetOnSuccess>
              <Field label="Provider"><input className="input" name="provider" placeholder="ChatGPT, Gemini, Perplexity…" required /></Field>
              <Field label="Query"><input className="input" name="query" placeholder="best task router for small teams" required /></Field>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" name="brandMentioned" /> Brand mentioned</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="cited" /> Cited with a link</label>
              </div>
              <Field label="Evidence kind">
                <select className="select" name="evidenceKind" defaultValue="screenshot">
                  <option value="screenshot">Screenshot</option>
                  <option value="transcript">Transcript</option>
                  <option value="url">Shared URL</option>
                  <option value="note">Note only</option>
                </select>
              </Field>
              <Field label="Evidence reference" hint="Required for anything other than a bare note.">
                <input className="input" name="evidenceRef" placeholder="./evidence/chatgpt-2026-10-29.png" />
              </Field>
              <Field label="Observed on"><input className="input" name="observedOn" type="date" /></Field>
              <Field label="Citation URLs"><input className="input" name="citationUrls" placeholder="comma separated" /></Field>
              <Field label="Recorded by"><input className="input" name="recordedBy" placeholder="your name" /></Field>
            </ActionForm>
          </Card>

          <Card title="Entity consistency check">
            <ActionButton action={checkEntityConsistencyAction} label="Check public records" variant="ghost" />
            <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>
              Fetches only the URLs recorded on your brand profile. LaunchOS never edits a third-party record.
            </p>
          </Card>

          {history.length > 0 && (
            <Card title={`Observations (${history.length})`}>
              <Table head={['Date', 'Provider', 'Mentioned', 'Cited']}>
                {history.slice(0, 20).map((r) => (
                  <tr key={String(r.id)}>
                    <td className="whitespace-nowrap">{String(r.observed_on)}</td>
                    <td>{String(r.provider)}</td>
                    <td><Badge kind={r.brand_mentioned ? 'pass' : 'fail'}>{r.brand_mentioned ? 'yes' : 'no'}</Badge></td>
                    <td><Badge kind={r.cited ? 'pass' : 'unknown'}>{r.cited ? 'yes' : 'no'}</Badge></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
