import { activeProject, database } from '@/lib/session';
import { PageHeader, NoProject } from '@/components/page-header';
import { Card, Badge, Note, Field, Empty } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { generateSocialAction, setSocialStatusAction } from '@/app/actions';
import { listSocialDrafts, PLATFORMS } from '@/core/services/social';
import { presetOf } from '@/core/presets';

export const metadata = { title: 'Social Studio' };

const KINDS = ['product_announcement', 'feature_demo', 'educational', 'founder_update', 'launch_recap', 'tutorial_outline', 'faq', 'release_notes'];

export default async function SocialPage() {
  const project = await activeProject();
  if (!project) return <NoProject />;
  const d = database();
  const drafts = listSocialDrafts(d, project.id);
  const preset = presetOf(project.preset);

  return (
    <>
      <PageHeader
        title="Social Studio"
        lede="Platform-specific drafts built from your verified facts. Nothing is published from here — you post it yourself."
      />

      <Note warn>
        Each platform gets its own structure and length; the same text is never duplicated across channels. A draft can
        only be marked published with a link to the live post.
      </Note>

      <div className="mt-4 grid gap-4 lg:grid-cols-[23rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card title="Generate drafts">
            <ActionForm action={generateSocialAction} submitLabel="Generate">
              <Field label="Content kind">
                <select className="select" name="kind" defaultValue="product_announcement">
                  {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
                </select>
              </Field>
              <Field label="Platforms" hint={`Default for this preset: ${preset.socialPlatforms.join(', ')}`}>
                <input className="input" name="platforms" placeholder={preset.socialPlatforms.join(',')} />
              </Field>
              <Field label="Extra detail" hint="Anything specific to this post. Optional.">
                <textarea className="textarea" name="detail" />
              </Field>
            </ActionForm>
          </Card>

          <Card title="Platform specifications">
            <div className="flex flex-col gap-3 text-xs">
              {Object.values(PLATFORMS).map((p) => (
                <div key={p.id}>
                  <p className="text-[0.8125rem] font-semibold">{p.label} <span className="font-normal tabular-nums" style={{ color: 'var(--text-dim)' }}>{p.hardLimit ?? '—'} chars</span></p>
                  <p style={{ color: 'var(--text-dim)' }}>{p.notes}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {drafts.length ? drafts.map((s) => (
            <Card
              key={s.id}
              title={<span className="flex flex-wrap items-center gap-2">{PLATFORMS[s.platform]?.label ?? s.platform}<Badge kind={s.status}>{s.status.replace(/_/g, ' ')}</Badge></span>}
              subtitle={`${s.format.replace(/_/g, ' ')} · ${s.charCount}${s.charLimit ? ` / ${s.charLimit}` : ''} characters`}
            >
              <pre className="code whitespace-pre-wrap">{s.body}</pre>
              {s.warnings.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1 text-xs" style={{ color: '#b45309' }}>
                  {s.warnings.map((w) => <li key={w}>! {w}</li>)}
                </ul>
              )}
              <p className="mt-3 text-xs" style={{ color: 'var(--text-dim)' }}>Media: {s.mediaRequirements.join(' · ')}</p>
              <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2">
                <ActionForm action={setSocialStatusAction} submitLabel="Approve" variant="ghost">
                  <input type="hidden" name="draftId" value={s.id} />
                  <input type="hidden" name="status" value="approved" />
                  <Field label="Approved by"><input className="input" name="by" placeholder="your name" required /></Field>
                </ActionForm>
                <ActionForm action={setSocialStatusAction} submitLabel="Mark published" variant="ghost">
                  <input type="hidden" name="draftId" value={s.id} />
                  <input type="hidden" name="status" value="published" />
                  <Field label="Live post URL" hint="Required. LaunchOS will not record a publication it cannot point at.">
                    <input className="input" name="evidence" placeholder="https://…" required />
                  </Field>
                  <input type="hidden" name="by" value="dashboard user" />
                </ActionForm>
              </div>
              {s.publishedEvidence && (
                <p className="mt-2 text-xs">Evidence: <a className="link" href={s.publishedEvidence} target="_blank" rel="noreferrer noopener">{s.publishedEvidence}</a></p>
              )}
            </Card>
          )) : (
            <Card title="No drafts"><Empty title="Nothing generated yet" body="Pick a content kind and generate platform-specific drafts from your brand profile." /></Card>
          )}
        </div>
      </div>
    </>
  );
}
