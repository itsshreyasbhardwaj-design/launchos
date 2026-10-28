import { bool, intOf, j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, slugify, type Result } from '../util';
import { presetOf, suggestPreset, type PresetId } from '../presets';
import { assertSafeUrl } from '../net/safe-fetch';

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  preset: PresetId;
  category: string | null;
  websiteUrl: string | null;
  country: string | null;
  market: string | null;
  launchStatus: 'pre_launch' | 'launched' | 'growing' | 'paused';
  owner: string | null;
  objectives: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BrandProfile = {
  id: string;
  projectId: string;
  brandName: string;
  tagline: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  valueProposition: string | null;
  targetAudience: string | null;
  problemsSolved: string | null;
  features: string[];
  pricingModel: string | null;
  pricingDetail: string | null;
  languages: string[];
  brandColors: string[];
  logoPath: string | null;
  contactEmail: string | null;
  contactPublic: boolean;
  social: Record<string, string>;
  githubUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  /** Field name -> how the operator verified it. Unverified fields are never used as facts. */
  verifiedFields: Record<string, string>;
  revision: number;
  updatedAt: string;
};

export function ensureWorkspace(d: Db, name = 'Default workspace'): string {
  const existing = d.get<{ id: string }>('SELECT id FROM workspaces ORDER BY created_at LIMIT 1');
  if (existing) return existing.id;
  const id = newId('ws');
  d.run('INSERT INTO workspaces (id, name, created_at) VALUES (?,?,?)', id, name, nowIso());
  return id;
}

export type CreateProjectInput = {
  name: string;
  preset?: PresetId;
  category?: string;
  websiteUrl?: string;
  country?: string;
  market?: string;
  owner?: string;
  objectives?: string;
  launchStatus?: Project['launchStatus'];
  workspaceId?: string;
};

export async function createProject(d: Db, input: CreateProjectInput): Promise<Result<Project>> {
  const name = input.name?.trim();
  if (!name) return err('project name is required');
  const workspaceId = input.workspaceId ?? ensureWorkspace(d);
  const slug = slugify(name);
  if (!slug) return err('project name must contain at least one alphanumeric character');
  if (d.get('SELECT id FROM projects WHERE workspace_id = ? AND slug = ?', workspaceId, slug)) {
    return err(`a project with slug "${slug}" already exists in this workspace`);
  }

  let website: string | null = null;
  if (input.websiteUrl) {
    const safe = await assertSafeUrl(input.websiteUrl);
    if (!safe.ok) return err(`website URL rejected: ${safe.error}`);
    website = safe.value.toString();
  }

  const preset = input.preset ?? suggestPreset({ websiteUrl: website ?? undefined, description: input.category }).preset;
  const id = newId('prj');
  const ts = nowIso();
  d.run(
    `INSERT INTO projects (id, workspace_id, name, slug, preset, category, website_url, country, market, launch_status, owner, objectives, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, workspaceId, name, slug, preset, input.category ?? null, website,
    input.country ?? null, input.market ?? null, input.launchStatus ?? 'pre_launch',
    input.owner ?? null, input.objectives ?? null, ts, ts
  );

  // Every project gets a canonical brand profile immediately: one source of truth.
  d.run(
    'INSERT INTO brand_profiles (id, project_id, brand_name, updated_at) VALUES (?,?,?,?)',
    newId('brand'), id, name, ts
  );

  if (website) {
    const host = new URL(website).host;
    d.run(
      'INSERT INTO project_domains (id, project_id, host, authorized, authorization_note, created_at) VALUES (?,?,?,?,?,?)',
      newId('dom'), id, host, 0, 'Added with the project. Confirm you control this domain before auditing it.', ts
    );
  }

  logEvent(d, { projectId: id, actor: 'system', action: 'project.created', target: id, detail: { preset, website } });
  return ok(getProject(d, id)!);
}

const rowToProject = (r: Record<string, unknown>): Project => ({
  id: r.id as string,
  workspaceId: r.workspace_id as string,
  name: r.name as string,
  slug: r.slug as string,
  preset: r.preset as PresetId,
  category: (r.category as string) ?? null,
  websiteUrl: (r.website_url as string) ?? null,
  country: (r.country as string) ?? null,
  market: (r.market as string) ?? null,
  launchStatus: r.launch_status as Project['launchStatus'],
  owner: (r.owner as string) ?? null,
  objectives: (r.objectives as string) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

export function getProject(d: Db, idOrSlug: string): Project | null {
  const r =
    d.get<Record<string, unknown>>('SELECT * FROM projects WHERE id = ?', idOrSlug) ??
    d.get<Record<string, unknown>>('SELECT * FROM projects WHERE slug = ?', idOrSlug);
  return r ? rowToProject(r) : null;
}

export function listProjects(d: Db): Project[] {
  return d.all<Record<string, unknown>>('SELECT * FROM projects ORDER BY updated_at DESC').map(rowToProject);
}

export function requireProject(d: Db, idOrSlug: string): Result<Project> {
  const p = getProject(d, idOrSlug);
  return p ? ok(p) : err(`no project found for "${idOrSlug}"`);
}

export function updateProject(d: Db, id: string, patch: Partial<CreateProjectInput>): Result<Project> {
  const p = getProject(d, id);
  if (!p) return err(`no project ${id}`);
  const map: Record<string, string> = {
    name: 'name', preset: 'preset', category: 'category', websiteUrl: 'website_url',
    country: 'country', market: 'market', owner: 'owner', objectives: 'objectives', launchStatus: 'launch_status',
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[k];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (!sets.length) return ok(p);
  sets.push('updated_at = ?');
  vals.push(nowIso(), id);
  d.run(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, ...vals);
  logEvent(d, { projectId: id, actor: 'user', action: 'project.updated', target: id, detail: patch });
  return ok(getProject(d, id)!);
}

export function deleteProject(d: Db, id: string): Result<{ id: string }> {
  const p = getProject(d, id);
  if (!p) return err(`no project ${id}`);
  d.run('DELETE FROM projects WHERE id = ?', id);
  logEvent(d, { projectId: null, actor: 'user', action: 'project.deleted', target: id, detail: { name: p.name } });
  return ok({ id });
}

// ---------------------------------------------------------------- brand profile

const rowToBrand = (r: Record<string, unknown>): BrandProfile => ({
  id: r.id as string,
  projectId: r.project_id as string,
  brandName: r.brand_name as string,
  tagline: (r.tagline as string) ?? null,
  shortDescription: (r.short_description as string) ?? null,
  longDescription: (r.long_description as string) ?? null,
  valueProposition: (r.value_proposition as string) ?? null,
  targetAudience: (r.target_audience as string) ?? null,
  problemsSolved: (r.problems_solved as string) ?? null,
  features: j.parse<string[]>(r.features_json, []),
  pricingModel: (r.pricing_model as string) ?? null,
  pricingDetail: (r.pricing_detail as string) ?? null,
  languages: j.parse<string[]>(r.languages_json, []),
  brandColors: j.parse<string[]>(r.brand_colors_json, []),
  logoPath: (r.logo_path as string) ?? null,
  contactEmail: (r.contact_email as string) ?? null,
  contactPublic: bool(r.contact_public),
  social: j.parse<Record<string, string>>(r.social_json, {}),
  githubUrl: (r.github_url as string) ?? null,
  appStoreUrl: (r.app_store_url as string) ?? null,
  playStoreUrl: (r.play_store_url as string) ?? null,
  verifiedFields: j.parse<Record<string, string>>(r.verified_fields_json, {}),
  revision: Number(r.revision ?? 1),
  updatedAt: r.updated_at as string,
});

export function getBrand(d: Db, projectId: string): BrandProfile | null {
  const r = d.get<Record<string, unknown>>('SELECT * FROM brand_profiles WHERE project_id = ?', projectId);
  return r ? rowToBrand(r) : null;
}

export type BrandPatch = Partial<Omit<BrandProfile, 'id' | 'projectId' | 'revision' | 'updatedAt'>>;

/** Fields that end up in published listings and therefore trigger update tasks when they change. */
export const PUBLISHED_FIELDS = [
  'brandName', 'tagline', 'shortDescription', 'longDescription', 'valueProposition',
  'features', 'pricingModel', 'pricingDetail', 'contactEmail', 'social', 'githubUrl',
  'appStoreUrl', 'playStoreUrl', 'languages',
] as const;

export type BrandChange = { field: string; before: unknown; after: unknown };

export function updateBrand(d: Db, projectId: string, patch: BrandPatch): Result<{ brand: BrandProfile; changes: BrandChange[] }> {
  const before = getBrand(d, projectId);
  if (!before) return err(`no brand profile for project ${projectId}`);

  const cols: Record<keyof BrandPatch, string> = {
    brandName: 'brand_name', tagline: 'tagline', shortDescription: 'short_description',
    longDescription: 'long_description', valueProposition: 'value_proposition', targetAudience: 'target_audience',
    problemsSolved: 'problems_solved', features: 'features_json', pricingModel: 'pricing_model',
    pricingDetail: 'pricing_detail', languages: 'languages_json', brandColors: 'brand_colors_json',
    logoPath: 'logo_path', contactEmail: 'contact_email', contactPublic: 'contact_public',
    social: 'social_json', githubUrl: 'github_url', appStoreUrl: 'app_store_url',
    playStoreUrl: 'play_store_url', verifiedFields: 'verified_fields_json',
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  const changes: BrandChange[] = [];

  for (const [key, col] of Object.entries(cols) as [keyof BrandPatch, string][]) {
    const v = patch[key];
    if (v === undefined) continue;
    const prev = before[key as keyof BrandProfile];
    const encoded = col.endsWith('_json') ? j.stringify(v) : typeof v === 'boolean' ? intOf(v) : v;
    if (JSON.stringify(prev) !== JSON.stringify(v)) changes.push({ field: key, before: prev, after: v });
    sets.push(`${col} = ?`);
    vals.push(encoded);
  }
  if (!sets.length) return ok({ brand: before, changes: [] });

  const bumpsRevision = changes.some((c) => (PUBLISHED_FIELDS as readonly string[]).includes(c.field));
  sets.push('revision = ?', 'updated_at = ?');
  vals.push(before.revision + (bumpsRevision ? 1 : 0), nowIso(), projectId);
  d.run(`UPDATE brand_profiles SET ${sets.join(', ')} WHERE project_id = ?`, ...vals);
  logEvent(d, { projectId, actor: 'user', action: 'brand.updated', detail: { changes: changes.map((c) => c.field) } });
  return ok({ brand: getBrand(d, projectId)!, changes });
}

/** Required brand fields per preset. Missing fields are reported as Unknown, never guessed. */
export function brandCompleteness(d: Db, projectId: string): { complete: string[]; missing: string[]; unverified: string[]; score: number } {
  const b = getBrand(d, projectId);
  const p = getProject(d, projectId);
  if (!b || !p) return { complete: [], missing: [], unverified: [], score: 0 };
  const required = [
    'brandName', 'tagline', 'shortDescription', 'longDescription',
    'valueProposition', 'targetAudience', 'problemsSolved', 'features', 'pricingModel',
  ];
  if (presetOf(p.preset).requiresPhysicalLocation) required.push('contactEmail');
  const complete: string[] = [];
  const missing: string[] = [];
  for (const f of required) {
    const v = (b as unknown as Record<string, unknown>)[f];
    const filled = Array.isArray(v) ? v.length > 0 : typeof v === 'string' ? v.trim().length > 0 : v != null;
    (filled ? complete : missing).push(f);
  }
  const unverified = complete.filter((f) => !b.verifiedFields[f]);
  return { complete, missing, unverified, score: Math.round((complete.length / required.length) * 100) };
}

// ---------------------------------------------------------------- domains

export type ProjectDomain = {
  id: string; projectId: string; host: string; authorized: boolean; authorizationNote: string | null;
  verifiedSearchConsole: boolean; verifiedBing: boolean; indexnowKey: string | null; createdAt: string;
};

const rowToDomain = (r: Record<string, unknown>): ProjectDomain => ({
  id: r.id as string, projectId: r.project_id as string, host: r.host as string,
  authorized: bool(r.authorized), authorizationNote: (r.authorization_note as string) ?? null,
  verifiedSearchConsole: bool(r.verified_search_console), verifiedBing: bool(r.verified_bing),
  indexnowKey: (r.indexnow_key as string) ?? null, createdAt: r.created_at as string,
});

export function listDomains(d: Db, projectId: string): ProjectDomain[] {
  return d.all<Record<string, unknown>>('SELECT * FROM project_domains WHERE project_id = ? ORDER BY created_at', projectId).map(rowToDomain);
}

export async function addDomain(d: Db, projectId: string, host: string): Promise<Result<ProjectDomain>> {
  const normalized = host.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  if (!normalized) return err('host is required');
  const probe = await assertSafeUrl(`https://${normalized}/`);
  if (!probe.ok) return err(`host rejected: ${probe.error}`);
  if (d.get('SELECT id FROM project_domains WHERE project_id = ? AND host = ?', projectId, normalized)) {
    return err(`host ${normalized} is already registered for this project`);
  }
  const id = newId('dom');
  d.run(
    'INSERT INTO project_domains (id, project_id, host, authorized, authorization_note, created_at) VALUES (?,?,?,?,?,?)',
    id, projectId, normalized, 0, 'Awaiting explicit authorization.', nowIso()
  );
  logEvent(d, { projectId, actor: 'user', action: 'domain.added', target: normalized });
  return ok(listDomains(d, projectId).find((x) => x.id === id)!);
}

/**
 * Records that the operator asserts control of a host. The audit engine refuses
 * to crawl anything that has not been through this gate.
 */
export function authorizeDomain(d: Db, projectId: string, host: string, note: string, by: string): Result<ProjectDomain> {
  if (!note.trim()) return err('an authorization note is required: state how you control this domain');
  const row = d.get<Record<string, unknown>>('SELECT * FROM project_domains WHERE project_id = ? AND host = ?', projectId, host.toLowerCase());
  if (!row) return err(`host ${host} is not registered for this project`);
  d.run('UPDATE project_domains SET authorized = 1, authorization_note = ? WHERE id = ?', `${note.trim()} — authorized by ${by}`, row.id as string);
  logEvent(d, { projectId, actor: by, action: 'domain.authorized', target: host, detail: { note } });
  return ok(rowToDomain(d.get<Record<string, unknown>>('SELECT * FROM project_domains WHERE id = ?', row.id as string)!));
}

export function authorizedHosts(d: Db, projectId: string): string[] {
  return listDomains(d, projectId).filter((x) => x.authorized).map((x) => x.host);
}

export function setDomainVerification(d: Db, projectId: string, host: string, patch: { searchConsole?: boolean; bing?: boolean; indexnowKey?: string }): Result<ProjectDomain> {
  const row = d.get<{ id: string }>('SELECT id FROM project_domains WHERE project_id = ? AND host = ?', projectId, host.toLowerCase());
  if (!row) return err(`host ${host} is not registered for this project`);
  if (patch.searchConsole !== undefined) d.run('UPDATE project_domains SET verified_search_console = ? WHERE id = ?', intOf(patch.searchConsole), row.id);
  if (patch.bing !== undefined) d.run('UPDATE project_domains SET verified_bing = ? WHERE id = ?', intOf(patch.bing), row.id);
  if (patch.indexnowKey !== undefined) d.run('UPDATE project_domains SET indexnow_key = ? WHERE id = ?', patch.indexnowKey || null, row.id);
  return ok(rowToDomain(d.get<Record<string, unknown>>('SELECT * FROM project_domains WHERE id = ?', row.id)!));
}

/** Project-scoped export of every row LaunchOS holds. Used for data portability and deletion review. */
export function exportProject(d: Db, projectId: string): Record<string, unknown[]> {
  const tables = [
    'brand_profiles', 'project_domains', 'project_assets', 'project_integrations', 'site_audits',
    'audit_findings', 'keyword_opportunities', 'keyword_clusters', 'content_pages', 'seo_tasks',
    'content_briefs', 'ai_search_queries', 'ai_visibility_observations', 'entity_consistency_checks',
    'directory_eligibility', 'listing_drafts', 'listing_submissions', 'campaigns', 'content_assets',
    'social_drafts', 'publishing_tasks', 'outreach_prospects', 'communities', 'backlinks',
    'utm_campaigns', 'analytics_imports', 'traffic_metrics', 'conversion_events', 'growth_experiments',
    'referral_programs', 'tasks', 'automation_runs', 'generated_reports', 'aso_listings', 'local_profiles',
    'audit_events',
  ];
  const out: Record<string, unknown[]> = {
    projects: d.all('SELECT * FROM projects WHERE id = ?', projectId),
  };
  for (const t of tables) out[t] = d.all(`SELECT * FROM ${t} WHERE project_id = ?`, projectId);
  return out;
}

// ---------------------------------------------------------------- assets

export type ProjectAsset = { id: string; kind: string; label: string; pathOrUrl: string | null; meta: Record<string, unknown>; createdAt: string };

export const ASSET_KINDS = ['logo', 'screenshot', 'demo_video', 'social_preview', 'icon', 'premises_photo', 'press_kit', 'other'] as const;

/**
 * Records a marketing asset the operator actually has.
 *
 * Listing preparation reads these to decide whether assets are in place, so an
 * asset only counts once someone has pointed at a real file or URL.
 */
export function addAsset(
  d: Db,
  projectId: string,
  input: { kind: string; label: string; pathOrUrl: string; meta?: Record<string, unknown> }
): Result<ProjectAsset> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!(ASSET_KINDS as readonly string[]).includes(input.kind)) {
    return err(`unknown asset kind "${input.kind}". Allowed: ${ASSET_KINDS.join(', ')}`);
  }
  if (!input.pathOrUrl.trim()) return err('a path or URL is required: LaunchOS does not record an asset it cannot point at');
  const id = newId('asset');
  d.run(
    'INSERT INTO project_assets (id, project_id, kind, label, path_or_url, meta_json, created_at) VALUES (?,?,?,?,?,?,?)',
    id, projectId, input.kind, input.label, input.pathOrUrl.trim(), j.stringify(input.meta ?? {}), nowIso()
  );
  logEvent(d, { projectId, actor: 'user', action: 'asset.added', target: input.kind });
  return ok(listAssets(d, projectId).find((a) => a.id === id)!);
}

export function listAssets(d: Db, projectId: string, kind?: string): ProjectAsset[] {
  const rows = d.all<Record<string, unknown>>('SELECT * FROM project_assets WHERE project_id = ? ORDER BY created_at DESC', projectId);
  const out = rows.map((r) => ({
    id: r.id as string, kind: r.kind as string, label: r.label as string,
    pathOrUrl: (r.path_or_url as string) ?? null,
    meta: j.parse<Record<string, unknown>>(r.meta_json, {}), createdAt: r.created_at as string,
  }));
  return kind ? out.filter((a) => a.kind === kind) : out;
}

export function countAssets(d: Db, projectId: string, kind: string): number {
  return Number(d.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_assets WHERE project_id = ? AND kind = ?', projectId, kind)?.n ?? 0);
}
