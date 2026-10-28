import { notFound } from 'next/navigation';
import { database } from '@/lib/session';
import { PageHeader } from '@/components/page-header';
import { Card, Field, Table, Badge, Note } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import {
  updateProjectAction, updateBrandAction, verifyBrandFieldAction,
  addDomainAction, authorizeDomainAction, setDomainVerificationAction, addAssetAction,
} from '@/app/actions';
import { getProject, getBrand, listDomains, brandCompleteness, listAssets, ASSET_KINDS } from '@/core/services/projects';
import { PRESET_IDS, PRESETS } from '@/core/presets';

export const metadata = { title: 'Project settings' };

const BRAND_FIELDS: { name: string; label: string; type: 'text' | 'area' | 'list'; hint?: string }[] = [
  { name: 'brandName', label: 'Brand name', type: 'text', hint: 'The one canonical spelling used everywhere.' },
  { name: 'tagline', label: 'Tagline', type: 'text' },
  { name: 'shortDescription', label: 'Short description', type: 'area' },
  { name: 'longDescription', label: 'Long description', type: 'area' },
  { name: 'valueProposition', label: 'Value proposition', type: 'area' },
  { name: 'targetAudience', label: 'Target audience', type: 'text' },
  { name: 'problemsSolved', label: 'Problems solved', type: 'area' },
  { name: 'features', label: 'Features', type: 'list', hint: 'Comma or newline separated. Only features that exist today.' },
  { name: 'pricingModel', label: 'Pricing model', type: 'text', hint: 'Never guessed. If it is free, say so.' },
  { name: 'pricingDetail', label: 'Pricing detail', type: 'text' },
  { name: 'languages', label: 'Supported languages', type: 'list' },
  { name: 'brandColors', label: 'Brand colours', type: 'list', hint: 'Hex values, used for generated social cards.' },
  { name: 'logoPath', label: 'Logo path or URL', type: 'text' },
  { name: 'contactEmail', label: 'Contact email', type: 'text' },
  { name: 'githubUrl', label: 'Repository URL', type: 'text' },
  { name: 'appStoreUrl', label: 'App Store URL', type: 'text' },
  { name: 'playStoreUrl', label: 'Play Store URL', type: 'text' },
];

export default async function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = database();
  const project = getProject(d, id);
  if (!project) notFound();
  const brand = getBrand(d, project.id);
  const domains = listDomains(d, project.id);
  const completeness = brandCompleteness(d, project.id);
  const assets = listAssets(d, project.id);

  return (
    <>
      <PageHeader
        title={project.name}
        lede="The canonical record for this project. Listings, social drafts, structured data and content briefs are all generated from these facts."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Project" subtitle="Changing the preset changes which channels and directories are prioritized.">
          <ActionForm action={updateProjectAction} submitLabel="Save project">
            <Field label="Name"><input className="input" name="name" defaultValue={project.name} /></Field>
            <Field label="Website URL"><input className="input" name="websiteUrl" type="url" defaultValue={project.websiteUrl ?? ''} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Preset">
                <select className="select" name="preset" defaultValue={project.preset}>
                  {PRESET_IDS.map((p) => <option key={p} value={p}>{PRESETS[p].label}</option>)}
                </select>
              </Field>
              <Field label="Launch status" hint="Launch platforms require a product people can use.">
                <select className="select" name="launchStatus" defaultValue={project.launchStatus}>
                  <option value="pre_launch">Pre-launch</option>
                  <option value="launched">Launched</option>
                  <option value="growing">Growing</option>
                  <option value="paused">Paused</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category"><input className="input" name="category" defaultValue={project.category ?? ''} /></Field>
              <Field label="Country"><input className="input" name="country" maxLength={2} defaultValue={project.country ?? ''} /></Field>
            </div>
            <Field label="Objectives"><textarea className="textarea" name="objectives" defaultValue={project.objectives ?? ''} /></Field>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-4">
          <Card
            title="Authorized domains"
            subtitle="The audit engine only crawls hosts recorded here as authorized. This is the gate, not a label."
          >
            {domains.length ? (
              <Table head={['Host', 'Authorized', 'Search Console', 'Bing']}>
                {domains.map((x) => (
                  <tr key={x.id}>
                    <td className="font-mono text-xs">{x.host}</td>
                    <td><Badge kind={x.authorized ? 'pass' : 'fail'}>{x.authorized ? 'yes' : 'no'}</Badge></td>
                    <td><Badge kind={x.verifiedSearchConsole ? 'pass' : 'unknown'}>{x.verifiedSearchConsole ? 'verified' : 'not recorded'}</Badge></td>
                    <td><Badge kind={x.verifiedBing ? 'pass' : 'unknown'}>{x.verifiedBing ? 'verified' : 'not recorded'}</Badge></td>
                  </tr>
                ))}
              </Table>
            ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No domains registered.</p>}

            <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
              <ActionForm action={addDomainAction} submitLabel="Register host" variant="ghost">
                <Field label="Add a host"><input className="input" name="host" placeholder="acme.example" required /></Field>
              </ActionForm>
              <ActionForm action={authorizeDomainAction} submitLabel="Authorize">
                <Field label="Authorize a host"><input className="input" name="host" placeholder="acme.example" required /></Field>
                <Field label="How do you control it?" hint="Required and recorded in the audit log.">
                  <input className="input" name="note" placeholder="I own the DNS zone" required />
                </Field>
                <Field label="Your name"><input className="input" name="by" placeholder="your name" /></Field>
              </ActionForm>
            </div>
            <div className="mt-4 border-t pt-4">
              <ActionForm action={setDomainVerificationAction} submitLabel="Record verification" variant="ghost">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Host"><input className="input" name="host" placeholder="acme.example" required /></Field>
                  <Field label="IndexNow key" hint="From Bing Webmaster Tools. Must be hosted at /<key>.txt.">
                    <input className="input" name="indexnowKey" placeholder="optional" />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2"><input type="checkbox" name="searchConsole" /> Verified in Search Console</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="bing" /> Verified in Bing</label>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card title="Marketing assets" subtitle="Listing approval is blocked until the required assets exist.">
            {assets.length ? (
              <Table head={['Kind', 'Label', 'Location']}>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td><Badge>{a.kind}</Badge></td>
                    <td>{a.label}</td>
                    <td className="max-w-[14rem] truncate font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{a.pathOrUrl}</td>
                  </tr>
                ))}
              </Table>
            ) : <p className="text-sm" style={{ color: 'var(--text-dim)' }}>No assets recorded.</p>}
            <div className="mt-4 border-t pt-4">
              <ActionForm action={addAssetAction} submitLabel="Record asset" variant="ghost" resetOnSuccess>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Kind">
                    <select className="select" name="kind">{ASSET_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select>
                  </Field>
                  <Field label="Label"><input className="input" name="label" placeholder="dashboard screenshot" required /></Field>
                  <Field label="Path or URL"><input className="input" name="pathOrUrl" placeholder="./assets/shot-1.png" required /></Field>
                </div>
              </ActionForm>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card
          title="Canonical brand profile"
          subtitle={`${completeness.score}% complete. ${completeness.missing.length ? `Missing: ${completeness.missing.join(', ')}.` : 'All required fields present.'}`}
        >
          <ActionForm action={updateBrandAction} submitLabel="Save brand profile">
            <div className="grid gap-3 sm:grid-cols-2">
              {BRAND_FIELDS.map((f) => {
                const raw = (brand as unknown as Record<string, unknown>)?.[f.name];
                const value = Array.isArray(raw) ? raw.join(', ') : (raw as string | null) ?? '';
                const verified = brand?.verifiedFields[f.name];
                return (
                  <div key={f.name} className={f.type === 'area' ? 'sm:col-span-2' : ''}>
                    <Field
                      label={`${f.label}${verified ? ' ✓' : ''}`}
                      hint={verified ? `Verified: ${verified}` : f.hint}
                    >
                      {f.type === 'area'
                        ? <textarea className="textarea" name={f.name} defaultValue={value} />
                        : <input className="input" name={f.name} defaultValue={value} />}
                    </Field>
                  </div>
                );
              })}
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="contactPublic" defaultChecked={brand?.contactPublic} />
                  The contact email may be published in listings
                </label>
              </div>
            </div>
          </ActionForm>
        </Card>

        <div className="flex flex-col gap-4">
          <Note warn>
            Unverified fields block listing approval. Mark a field verified only after checking it against reality —
            that record is what stops a stale price or a changed tagline going out in a public listing.
          </Note>
          <Card title="Mark a field verified">
            <ActionForm action={verifyBrandFieldAction} submitLabel="Mark verified" variant="ghost" resetOnSuccess>
              <Field label="Field">
                <select className="select" name="field">
                  {BRAND_FIELDS.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="How did you verify it?" hint="Recorded alongside the field.">
                <input className="input" name="how" placeholder="checked against the live pricing page" required />
              </Field>
            </ActionForm>
          </Card>
          {completeness.unverified.length > 0 && (
            <Card title={`${completeness.unverified.length} unverified field(s)`}>
              <ul className="flex flex-wrap gap-1.5">
                {completeness.unverified.map((f) => <li key={f}><Badge kind="unknown">{f}</Badge></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
