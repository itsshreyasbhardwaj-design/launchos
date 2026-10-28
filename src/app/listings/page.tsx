import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Table, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm, ActionButton } from '@/components/action-form';
import {
  matchDirectoriesAction, verifyDirectoriesAction, confirmDirectoryAction,
  prepareListingAction, approveListingAction, recordSubmissionAction, recordListingEvidenceAction,
} from '@/app/actions';
import { listDirectories } from '@/core/services/registry';
import { listListings, submissionInstructions } from '@/core/services/listings';
import { j } from '@/core/db';

export const metadata = { title: 'Directories & listings' };

export default async function ListingsPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const directories = listDirectories(d);
  const listings = listListings(d, project.id);
  const eligibility = d.all<Record<string, unknown>>(
    `SELECT de.*, dr.slug, dr.name FROM directory_eligibility de
     JOIN directory_registry dr ON dr.id = de.directory_id
     WHERE de.project_id = ? ORDER BY de.relevance DESC`, project.id
  );
  const submissions = d.all<Record<string, unknown>>(
    `SELECT ls.*, dr.name AS dir_name FROM listing_submissions ls
     JOIN listing_drafts ld ON ld.id = ls.draft_id
     JOIN directory_registry dr ON dr.id = ld.directory_id
     WHERE ls.project_id = ? ORDER BY ls.created_at DESC`, project.id
  );

  const byState = (s: string) => eligibility.filter((e) => e.eligible === s).length;

  return (
    <>
      <PageHeader
        title="Directories & listings"
        lede="Real destinations, checked for eligibility and cost. LaunchOS prepares the copy; you submit it."
        actions={<ActionButton action={matchDirectoriesAction} label="Match this project" />}
      />

      <Note warn>
        Registry rows start as unverified seed data. &ldquo;Reachable&rdquo; means the URL loaded — it does not confirm
        that submission is free. Confirm that yourself per destination, and a listing is only marked live on verified evidence.
      </Note>

      <div className="mt-4 grid gap-4 sm:grid-cols-4">
        <div className="card p-3"><p className="label">Eligible</p><p className="text-xl font-semibold">{byState('eligible')}</p></div>
        <div className="card p-3"><p className="label">Needs check</p><p className="text-xl font-semibold">{byState('needs_check')}</p></div>
        <div className="card p-3"><p className="label">Not eligible</p><p className="text-xl font-semibold">{byState('not_eligible')}</p></div>
        <div className="card p-3"><p className="label">Paid only</p><p className="text-xl font-semibold">{byState('paid_only')}</p></div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {eligibility.length ? (
            <Card title="Matched destinations" subtitle="Ranked by relevance. Blockers say exactly what is unresolved.">
              <div className="flex flex-col gap-4">
                {eligibility.slice(0, 25).map((e) => {
                  const reasons = j.parse<string[]>(e.reasons_json, []);
                  const blockers = j.parse<string[]>(e.blockers_json, []);
                  const existing = listings.find((l) => l.directorySlug === e.slug);
                  return (
                    <div key={String(e.id)} className="border-t pt-3 first:border-t-0 first:pt-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <Badge kind={String(e.eligible)}>{String(e.eligible).replace(/_/g, ' ')}</Badge>
                        {String(e.name)}
                        <span className="text-xs font-normal tabular-nums" style={{ color: 'var(--text-dim)' }}>{String(e.relevance)}/100</span>
                        {existing && <Badge kind={existing.status}>{existing.status.replace(/_/g, ' ')}</Badge>}
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs">
                        {reasons.slice(0, 2).map((r) => <li key={r} style={{ color: 'var(--text-dim)' }}>+ {r}</li>)}
                        {blockers.map((b) => <li key={b} style={{ color: '#b45309' }}>− {b}</li>)}
                      </ul>
                      {String(e.eligible) !== 'not_eligible' && (
                        <div className="mt-2">
                          <ActionForm action={prepareListingAction} submitLabel={existing ? 'Re-prepare listing' : 'Prepare listing'} variant="ghost">
                            <input type="hidden" name="slug" value={String(e.slug)} />
                          </ActionForm>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card title="Matched destinations">
              <Empty title="Not matched yet" body="Match this project against the registry to see which destinations are relevant, free and eligible." />
            </Card>
          )}

          {listings.length > 0 && (
            <Card title={`Prepared listings (${listings.length})`}>
              <div className="flex flex-col gap-5">
                {await Promise.all(listings.map(async (l) => {
                  const instructions = submissionInstructions(d, project.id, l.directorySlug);
                  return (
                    <div key={l.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {l.directoryName}
                        <Badge kind={l.status}>{l.status.replace(/_/g, ' ')}</Badge>
                        {l.approvedBy && <span className="text-xs font-normal" style={{ color: 'var(--text-dim)' }}>approved by {l.approvedBy}</span>}
                      </p>

                      {l.warnings.length > 0 && (
                        <ul className="mt-2 flex flex-col gap-1 text-xs" style={{ color: '#b45309' }}>
                          {l.warnings.map((w) => <li key={w}>! {w}</li>)}
                        </ul>
                      )}

                      <dl className="mt-2 grid gap-1 text-[0.8125rem]">
                        {Object.entries(l.fields).map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-2">
                            <dt className="text-xs" style={{ color: 'var(--text-dim)' }}>{k} ({v.length})</dt>
                            <dd className="whitespace-pre-wrap break-words">{v}</dd>
                          </div>
                        ))}
                      </dl>

                      <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                        {l.assetChecklist.map((a) => (
                          <li key={a} style={{ color: a.startsWith('MISSING') ? '#b45309' : 'var(--text-dim)' }}>{a}</li>
                        ))}
                      </ul>

                      {instructions.ok && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-dim)' }}>Manual submission steps</summary>
                          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-xs">
                            {instructions.value.steps.map((s, i) => <li key={i} className="break-words">{s}</li>)}
                          </ol>
                        </details>
                      )}

                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ActionForm action={approveListingAction} submitLabel="Approve" variant="ghost">
                          <input type="hidden" name="slug" value={l.directorySlug} />
                          <Field label="Approved by" hint="Approval is attributed and logged."><input className="input" name="by" placeholder="your name" required /></Field>
                        </ActionForm>
                        <ActionForm action={recordSubmissionAction} submitLabel="I submitted it" variant="ghost">
                          <input type="hidden" name="slug" value={l.directorySlug} />
                          <Field label="Submitted on"><input className="input" name="date" type="date" /></Field>
                        </ActionForm>
                      </div>
                    </div>
                  );
                }))}
              </div>
            </Card>
          )}

          {submissions.length > 0 && (
            <Card title="Submissions" subtitle="A listing only becomes live when the evidence checks out.">
              <Table head={['Destination', 'Status', 'Submitted', 'Live URL']}>
                {submissions.map((s) => (
                  <tr key={String(s.id)}>
                    <td className="font-medium">{String(s.dir_name)}</td>
                    <td><Badge kind={String(s.status)}>{String(s.status)}</Badge></td>
                    <td>{String(s.submitted_at ?? '—')}</td>
                    <td className="max-w-[16rem] truncate">{s.live_url ? <a className="link" href={String(s.live_url)} target="_blank" rel="noreferrer noopener">{String(s.live_url)}</a> : '—'}</td>
                  </tr>
                ))}
              </Table>
              <div className="mt-4 border-t pt-4">
                <ActionForm action={recordListingEvidenceAction} submitLabel="Attach evidence">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Submission id">
                      <select className="select" name="submissionId">
                        {submissions.map((s) => <option key={String(s.id)} value={String(s.id)}>{String(s.dir_name)} · {String(s.id).slice(0, 12)}</option>)}
                      </select>
                    </Field>
                    <Field label="Live URL" hint="Fetched and checked for your brand name.">
                      <input className="input" name="liveUrl" placeholder="https://destination.example/your-listing" />
                    </Field>
                    <Field label="Observed on"><input className="input" name="observedOn" type="date" /></Field>
                  </div>
                </ActionForm>
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Verify the registry">
            <ActionButton action={verifyDirectoriesAction} label="Check registry URLs" variant="ghost" />
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'var(--text-dim)' }}>
              Makes one polite request per destination and records whether it loaded, with the date.
            </p>
          </Card>

          <Card title="Confirm a destination yourself">
            <ActionForm action={confirmDirectoryAction} submitLabel="Record confirmation" variant="ghost" resetOnSuccess>
              <Field label="Destination">
                <select className="select" name="slug">
                  {directories.map((x) => <option key={x.slug} value={x.slug}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="Free submission?">
                <select className="select" name="freeSubmission" defaultValue="free">
                  <option value="free">Free</option>
                  <option value="freemium">Free tier exists</option>
                  <option value="paid">Paid only</option>
                  <option value="unknown">Still unknown</option>
                </select>
              </Field>
              <Field label="Submission URL"><input className="input" name="submissionUrl" placeholder="https://…" /></Field>
              <Field label="Notes"><input className="input" name="notes" placeholder="what you found" /></Field>
              <Field label="Your name"><input className="input" name="by" placeholder="your name" /></Field>
            </ActionForm>
          </Card>

          <Card title={`Registry (${directories.length})`}>
            <Table head={['Destination', 'Free', 'Checked']}>
              {directories.map((x) => (
                <tr key={x.id}>
                  <td>
                    <a className="link font-medium" href={x.submissionUrl ?? x.officialUrl} target="_blank" rel="noreferrer noopener">{x.name}</a>
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{x.category.replace(/_/g, ' ')} · {x.geography}</p>
                  </td>
                  <td><Badge kind={x.freeSubmission === 'free' ? 'free' : x.freeSubmission === 'paid' ? 'fail' : 'unknown'}>{x.freeSubmission}</Badge></td>
                  <td className="text-xs" style={{ color: 'var(--text-dim)' }}>{x.lastVerified ?? x.verificationStatus}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
