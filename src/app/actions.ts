'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { database, PROJECT_COOKIE, activeProject } from '@/lib/session';
import * as core from '@/core';

/**
 * Server actions.
 *
 * Every mutating control in the dashboard goes through here. Project scope is
 * always read from the session cookie on the server, never from the form, so a
 * crafted request cannot reach another project's data.
 */

export type ActionState = { ok: boolean; message: string; detail?: string };

const s = (f: FormData, k: string): string => String(f.get(k) ?? '').trim();
const n = (f: FormData, k: string): number | undefined => {
  const v = s(f, k);
  if (!v) return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
};
const b = (f: FormData, k: string): boolean => {
  const v = f.get(k);
  return v === 'on' || v === 'true' || v === '1';
};
const csv = (f: FormData, k: string): string[] => s(f, k).split(/\s*[,|\n]\s*/).filter(Boolean);

const fail = (message: string, detail?: string): ActionState => ({ ok: false, message, detail });
const done = (message: string, paths: string[] = []): ActionState => {
  for (const p of paths) revalidatePath(p);
  return { ok: true, message };
};

async function scoped(): Promise<{ d: core.Db; projectId: string } | null> {
  const p = await activeProject();
  if (!p) return null;
  return { d: database(), projectId: p.id };
}

// ---------------------------------------------------------------- projects

export async function selectProject(formData: FormData): Promise<void> {
  const id = s(formData, 'projectId');
  const store = await cookies();
  store.set(PROJECT_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
}

export async function createProjectAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const d = database();
  const res = await core.createProject(d, {
    name: s(formData, 'name'),
    websiteUrl: s(formData, 'websiteUrl') || undefined,
    preset: (s(formData, 'preset') || undefined) as core.PresetId | undefined,
    category: s(formData, 'category') || undefined,
    country: s(formData, 'country') || undefined,
    market: s(formData, 'market') || undefined,
    owner: s(formData, 'owner') || undefined,
    objectives: s(formData, 'objectives') || undefined,
    launchStatus: (s(formData, 'launchStatus') || undefined) as core.Project['launchStatus'] | undefined,
  });
  if (!res.ok) return fail(res.error);
  const store = await cookies();
  store.set(PROJECT_COOKIE, res.value.id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  revalidatePath('/', 'layout');
  redirect(`/projects/${res.value.id}`);
}

export async function updateProjectAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.updateProject(ctx.d, ctx.projectId, {
    name: s(formData, 'name') || undefined,
    websiteUrl: s(formData, 'websiteUrl') || undefined,
    category: s(formData, 'category') || undefined,
    country: s(formData, 'country') || undefined,
    market: s(formData, 'market') || undefined,
    objectives: s(formData, 'objectives') || undefined,
    preset: (s(formData, 'preset') || undefined) as core.PresetId | undefined,
    launchStatus: (s(formData, 'launchStatus') || undefined) as core.Project['launchStatus'] | undefined,
  });
  return res.ok ? done('Project updated.', ['/', '/projects']) : fail(res.error);
}

export async function updateBrandAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const patch: core.BrandPatch = {};
  const text = ['brandName', 'tagline', 'shortDescription', 'longDescription', 'valueProposition',
    'targetAudience', 'problemsSolved', 'pricingModel', 'pricingDetail', 'logoPath',
    'contactEmail', 'githubUrl', 'appStoreUrl', 'playStoreUrl'] as const;
  for (const k of text) {
    if (formData.has(k)) (patch as Record<string, unknown>)[k] = s(formData, k);
  }
  for (const k of ['features', 'languages', 'brandColors'] as const) {
    if (formData.has(k)) (patch as Record<string, unknown>)[k] = csv(formData, k);
  }
  if (formData.has('contactPublic')) patch.contactPublic = b(formData, 'contactPublic');

  const res = core.updateBrand(ctx.d, ctx.projectId, patch);
  if (!res.ok) return fail(res.error);
  const prop = core.propagateBrandChange(ctx.d, ctx.projectId, res.value.changes.map((c) => c.field));
  revalidatePath('/', 'layout');
  return {
    ok: true,
    message: `Saved ${res.value.changes.length} change(s).`,
    detail: prop.flagged.length
      ? `${prop.flagged.length} listing(s) flagged for update and ${prop.tasks} task(s) created. Published listings are never rewritten automatically.`
      : undefined,
  };
}

export async function verifyBrandFieldAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const field = s(formData, 'field');
  const how = s(formData, 'how');
  if (!field || !how) return fail('Both the field and how you verified it are required.');
  const brand = core.getBrand(ctx.d, ctx.projectId);
  if (!brand) return fail('No brand profile.');
  const res = core.updateBrand(ctx.d, ctx.projectId, { verifiedFields: { ...brand.verifiedFields, [field]: how } });
  return res.ok ? done(`Marked "${field}" verified.`, ['/projects']) : fail(res.error);
}

export async function addAssetAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.addAsset(ctx.d, ctx.projectId, {
    kind: s(formData, 'kind'), label: s(formData, 'label'), pathOrUrl: s(formData, 'pathOrUrl'),
  });
  return res.ok ? done('Asset recorded.', ['/projects', '/listings']) : fail(res.error);
}

export async function addDomainAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = await core.addDomain(ctx.d, ctx.projectId, s(formData, 'host'));
  return res.ok ? done('Domain registered. Authorize it before auditing.', ['/projects']) : fail(res.error);
}

export async function authorizeDomainAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.authorizeDomain(ctx.d, ctx.projectId, s(formData, 'host'), s(formData, 'note'), s(formData, 'by') || 'dashboard user');
  return res.ok ? done('Domain authorized for auditing.', ['/projects', '/audit']) : fail(res.error);
}

export async function setDomainVerificationAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.setDomainVerification(ctx.d, ctx.projectId, s(formData, 'host'), {
    searchConsole: formData.has('searchConsole') ? b(formData, 'searchConsole') : undefined,
    bing: formData.has('bing') ? b(formData, 'bing') : undefined,
    indexnowKey: formData.has('indexnowKey') ? s(formData, 'indexnowKey') : undefined,
  });
  return res.ok ? done('Verification state recorded.', ['/projects', '/search-engines', '/readiness']) : fail(res.error);
}

// ---------------------------------------------------------------- audit

export async function runAuditAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = await core.runProjectAudit(ctx.d, ctx.projectId, {
    maxPages: n(formData, 'maxPages'),
    maxDepth: n(formData, 'maxDepth'),
    sitemapUrl: s(formData, 'sitemapUrl') || undefined,
    runLighthouse: b(formData, 'lighthouse'),
  });
  if (!res.ok) return fail('Audit failed.', res.error);
  revalidatePath('/', 'layout');
  return {
    ok: true,
    message: `Crawled ${res.value.result.pages.length} page(s) and found ${res.value.result.findings.length} issue(s).`,
    detail: `${res.value.tasksCreated} SEO task(s) created.${res.value.result.linkDiscovery ? '' : ' robots.txt was unreachable, so link discovery was disabled for this run.'}`,
  };
}

export async function setSeoTaskStatusAction(formData: FormData): Promise<void> {
  const ctx = await scoped();
  if (!ctx) return;
  core.setSeoTaskStatus(ctx.d, s(formData, 'taskId'), (s(formData, 'status') || 'done') as 'done');
  revalidatePath('/seo');
  revalidatePath('/');
}

// ---------------------------------------------------------------- seo

export async function importSearchCsvAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const file = formData.get('file');
  const pasted = s(formData, 'pasted');
  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > 8_000_000) return fail('That file is over 8 MB. Export a narrower date range.');
    text = await file.text();
  }
  if (!text) return fail('Upload a CSV or paste its contents.');
  const res = core.importSearchPerformance(ctx.d, ctx.projectId, text, {
    provider: (s(formData, 'provider') || 'other') as 'google_search_console',
    filename: file instanceof File ? file.name : 'pasted',
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/', 'layout');
  return { ok: true, message: `Imported ${res.value.imported} row(s), skipped ${res.value.skipped}.`, detail: `Columns detected: ${res.value.columns.join(', ')}` };
}

export async function addKeywordsAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.addKeywordHypotheses(ctx.d, ctx.projectId, csv(formData, 'keywords'));
  return res.ok ? done(`Added ${res.value.added} keyword hypothesis/es.`, ['/keywords', '/seo']) : fail(res.error);
}

export async function deriveKeywordsAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.deriveKeywordsFromSite(ctx.d, ctx.projectId);
  if (!res.ok) return fail(res.error);
  revalidatePath('/keywords');
  return { ok: true, message: `Derived ${res.value.added} candidate(s).`, detail: `Source: ${res.value.from}` };
}

export async function clusterKeywordsAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.buildClusters(ctx.d, ctx.projectId);
  if (!res.ok) return fail(res.error);
  core.buildContentMap(ctx.d, ctx.projectId);
  revalidatePath('/keywords');
  revalidatePath('/seo');
  return { ok: true, message: `Built ${res.value.length} cluster(s) and mapped them to pages.` };
}

// ---------------------------------------------------------------- geo

export async function recordVisibilityAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.recordVisibility(ctx.d, ctx.projectId, {
    provider: s(formData, 'provider'),
    query: s(formData, 'query'),
    brandMentioned: b(formData, 'brandMentioned'),
    cited: b(formData, 'cited'),
    citationUrls: csv(formData, 'citationUrls'),
    evidenceKind: (s(formData, 'evidenceKind') || 'note') as 'note',
    evidenceRef: s(formData, 'evidenceRef') || undefined,
    observedOn: s(formData, 'observedOn') || undefined,
    notes: s(formData, 'notes') || undefined,
    recordedBy: s(formData, 'recordedBy') || 'dashboard user',
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/geo');
  return { ok: true, message: 'Observation recorded.', detail: res.value.caveat };
}

export async function checkEntityConsistencyAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = await core.checkEntityConsistency(ctx.d, ctx.projectId);
  if (!res.ok) return fail(res.error);
  revalidatePath('/geo');
  const bad = res.value.filter((r) => r.status !== 'consistent').length;
  return { ok: true, message: `Checked ${res.value.length} record(s) across your public profiles.`, detail: bad ? `${bad} inconsistency/ies found.` : 'Everything agreed.' };
}

export async function generateAiQueriesAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.generateAiQueries(ctx.d, ctx.projectId);
  return res.ok ? done(`Generated ${res.value.length} query/ies to run yourself.`, ['/geo']) : fail(res.error);
}

// ---------------------------------------------------------------- directories & listings

export async function matchDirectoriesAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.matchDirectories(ctx.d, ctx.projectId);
  if (!res.ok) return fail(res.error);
  revalidatePath('/listings');
  const eligible = res.value.filter((m) => m.eligible === 'eligible').length;
  return { ok: true, message: `Evaluated ${res.value.length} destination(s): ${eligible} eligible.` };
}

export async function verifyDirectoriesAction(_prev: ActionState | null): Promise<ActionState> {
  const d = database();
  const res = await core.verifyDirectories(d, { limit: 40 });
  revalidatePath('/listings');
  return {
    ok: true,
    message: `Checked ${res.checked} registry URL(s): ${res.reachable} reachable.`,
    detail: 'Reachability is not the same as confirming free submission — confirm that yourself per destination.',
  };
}

export async function confirmDirectoryAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const d = database();
  const res = core.confirmDirectory(d, s(formData, 'slug'), {
    freeSubmission: (s(formData, 'freeSubmission') || undefined) as 'free' | undefined,
    submissionUrl: s(formData, 'submissionUrl') || undefined,
    notes: s(formData, 'notes') || undefined,
    by: s(formData, 'by') || 'dashboard user',
  });
  return res.ok ? done('Recorded your confirmation.', ['/listings']) : fail(res.error);
}

export async function prepareListingAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.prepareListing(ctx.d, ctx.projectId, s(formData, 'slug'));
  if (!res.ok) return fail(res.error);
  revalidatePath('/listings');
  return {
    ok: true,
    message: `Listing prepared — status "${res.value.status}".`,
    detail: res.value.warnings.length ? `${res.value.warnings.length} warning(s) to resolve before approval.` : undefined,
  };
}

export async function approveListingAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.approveListing(ctx.d, ctx.projectId, s(formData, 'slug'), s(formData, 'by'));
  return res.ok ? done('Approved and ready for you to submit.', ['/listings']) : fail('Approval refused.', res.error);
}

export async function recordSubmissionAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.recordSubmission(ctx.d, ctx.projectId, s(formData, 'slug'), {
    method: 'manual', submittedAt: s(formData, 'date') || undefined, note: s(formData, 'note') || undefined,
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/listings');
  return { ok: true, message: 'Recorded as submitted.', detail: `Attach evidence when it is visibly live. Submission id: ${res.value.submissionId}` };
}

export async function recordListingEvidenceAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const liveUrl = s(formData, 'liveUrl');
  const res = await core.recordEvidence(ctx.d, s(formData, 'submissionId'), {
    kind: liveUrl ? 'live_url' : 'note',
    reference: liveUrl || s(formData, 'reference'),
    observedOn: s(formData, 'observedOn') || undefined,
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/listings');
  return { ok: res.value.verified, message: res.value.verified ? 'Verified live.' : 'Recorded, but not marked live.', detail: res.value.detail };
}

// ---------------------------------------------------------------- launch & campaigns

export async function scheduleLaunchAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.scheduleLaunch(ctx.d, ctx.projectId, s(formData, 'playbook'), s(formData, 'date'));
  return res.ok ? done(`Created ${res.value.created} dated task(s).`, ['/launch', '/']) : fail(res.error);
}

export async function createCampaignAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.createCampaign(ctx.d, ctx.projectId, {
    name: s(formData, 'name'),
    template: s(formData, 'template') || undefined,
    objective: s(formData, 'objective') || undefined,
    audience: s(formData, 'audience') || undefined,
    region: s(formData, 'region') || undefined,
    startsOn: s(formData, 'startsOn') || undefined,
    endsOn: s(formData, 'endsOn') || undefined,
    channels: csv(formData, 'channels'),
  });
  return res.ok ? done('Campaign created.', ['/campaigns']) : fail(res.error);
}

// ---------------------------------------------------------------- content & social

export async function createBriefAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.createBrief(ctx.d, ctx.projectId, {
    clusterId: s(formData, 'clusterId') || undefined,
    topic: s(formData, 'topic') || undefined,
    contentType: s(formData, 'contentType') || undefined,
  });
  return res.ok ? done(`Brief created: ${res.value.workingTitle}`, ['/content']) : fail(res.error);
}

export async function generateSocialAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.generateSocialDrafts(ctx.d, ctx.projectId, {
    kind: (s(formData, 'kind') || 'product_announcement') as core.DraftKind,
    platforms: csv(formData, 'platforms'),
    detail: s(formData, 'detail') || undefined,
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/social');
  const warned = res.value.filter((x) => x.warnings.length).length;
  return { ok: true, message: `Generated ${res.value.length} platform-specific draft(s).`, detail: warned ? `${warned} carry warnings that block approval.` : undefined };
}

export async function setSocialStatusAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.setDraftStatus(
    ctx.d, s(formData, 'draftId'),
    s(formData, 'status') as 'approved',
    s(formData, 'by') || 'dashboard user',
    s(formData, 'evidence') || undefined
  );
  return res.ok ? done(`Draft is now "${res.value.status}".`, ['/social']) : fail(res.error);
}

// ---------------------------------------------------------------- growth

export async function addProspectAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.addProspect(ctx.d, ctx.projectId, {
    organization: s(formData, 'organization'),
    website: s(formData, 'website') || undefined,
    contactChannel: s(formData, 'contactChannel') || undefined,
    contactBasis: s(formData, 'contactBasis'),
    opportunityType: s(formData, 'opportunityType'),
    relevanceReason: s(formData, 'relevanceReason'),
    source: s(formData, 'source') || 'dashboard',
  });
  return res.ok ? done('Prospect recorded.', ['/outreach']) : fail(res.error);
}

export async function addCommunityAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.addCommunity(ctx.d, ctx.projectId, {
    name: s(formData, 'name'),
    url: s(formData, 'url') || undefined,
    kind: s(formData, 'kind') || 'forum',
    selfPromotionRules: s(formData, 'selfPromotionRules'),
    permittedFormats: csv(formData, 'permittedFormats'),
    relevanceReason: s(formData, 'relevanceReason') || undefined,
  });
  return res.ok ? done('Community recorded with its rules.', ['/communities']) : fail(res.error);
}

export async function addBacklinkAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.addBacklink(ctx.d, ctx.projectId, {
    sourceUrl: s(formData, 'sourceUrl'),
    targetUrl: s(formData, 'targetUrl'),
    anchor: s(formData, 'anchor') || undefined,
    origin: s(formData, 'origin'),
  });
  return res.ok ? done('Backlink recorded. Verify it to confirm the link is really there.', ['/backlinks']) : fail(res.error);
}

export async function verifyBacklinksAction(_prev: ActionState | null): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = await core.verifyBacklinks(ctx.d, ctx.projectId);
  if (!res.ok) return fail(res.error);
  revalidatePath('/backlinks');
  return { ok: true, message: `Checked ${res.value.checked}: ${res.value.present} link(s) confirmed on the page.`, detail: res.value.missing.length ? `${res.value.missing.length} could not be confirmed.` : undefined };
}

// ---------------------------------------------------------------- analytics

export async function importAnalyticsAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const file = formData.get('file');
  let text = s(formData, 'pasted');
  if (file instanceof File && file.size > 0) {
    if (file.size > 8_000_000) return fail('That file is over 8 MB.');
    text = await file.text();
  }
  if (!text) return fail('Upload a CSV or paste its contents.');
  const res = core.importAnalyticsCsv(ctx.d, ctx.projectId, text, {
    provider: s(formData, 'provider') || 'csv',
    dimension: (s(formData, 'dimension') || 'page') as 'page',
    filename: file instanceof File ? file.name : 'pasted',
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/analytics');
  return { ok: true, message: `Imported ${res.value.imported} row(s), skipped ${res.value.skipped}.`, detail: `Columns: ${res.value.detectedColumns.join(', ')}` };
}

export async function recordConversionAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.recordConversion(ctx.d, ctx.projectId, {
    eventName: s(formData, 'eventName'),
    count: n(formData, 'count') ?? -1,
    eventDate: s(formData, 'eventDate') || undefined,
    source: s(formData, 'source') || undefined,
    note: s(formData, 'note') || undefined,
  });
  return res.ok ? done('Conversion recorded.', ['/analytics', '/']) : fail(res.error);
}

export async function buildUtmAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.buildUtm(ctx.d, ctx.projectId, {
    label: s(formData, 'label') || 'untitled',
    baseUrl: s(formData, 'baseUrl'),
    source: s(formData, 'source'),
    medium: s(formData, 'medium'),
    campaign: s(formData, 'campaign'),
    content: s(formData, 'content') || undefined,
    term: s(formData, 'term') || undefined,
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/analytics');
  return { ok: true, message: res.value.finalUrl, detail: res.value.warnings.join(' ') };
}

export async function createExperimentAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.createExperiment(ctx.d, ctx.projectId, {
    hypothesis: s(formData, 'hypothesis'),
    change: s(formData, 'change'),
    targetMetric: s(formData, 'targetMetric'),
    startsOn: s(formData, 'startsOn') || undefined,
    endsOn: s(formData, 'endsOn') || undefined,
    baselineValue: n(formData, 'baselineValue'),
  });
  return res.ok ? done('Experiment created.', ['/experiments']) : fail(res.error);
}

export async function analyzeExperimentAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.analyzeExperiment(ctx.d, s(formData, 'experimentId'), {
    sampleBaseline: n(formData, 'sampleBaseline') ?? -1,
    conversionsBaseline: n(formData, 'conversionsBaseline') ?? -1,
    sampleVariant: n(formData, 'sampleVariant') ?? -1,
    conversionsVariant: n(formData, 'conversionsVariant') ?? -1,
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/experiments');
  return { ok: true, message: res.value.verdict, detail: `p=${res.value.pValueTwoSided ?? 'n/a'}, z=${res.value.zScore ?? 'n/a'}, sample needed per group: ${res.value.minimumSampleForDetection ?? 'n/a'}` };
}

export async function decideExperimentAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.decideExperiment(ctx.d, s(formData, 'experimentId'), s(formData, 'decision'), s(formData, 'followup') || undefined);
  return res.ok ? done('Decision recorded.', ['/experiments']) : fail(res.error);
}

// ---------------------------------------------------------------- channels & reports

export async function prepareAsoAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.prepareAso(ctx.d, ctx.projectId, s(formData, 'store') as 'apple');
  if (!res.ok) return fail(res.error);
  revalidatePath('/aso');
  return { ok: true, message: 'Store listing prepared.', detail: res.value.costNote };
}

export async function setLocalProfileAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const res = core.setLocalProfile(ctx.d, ctx.projectId, {
    businessName: s(formData, 'businessName'),
    street: s(formData, 'street') || undefined,
    city: s(formData, 'city') || undefined,
    region: s(formData, 'region') || undefined,
    postalCode: s(formData, 'postalCode') || undefined,
    country: s(formData, 'country') || undefined,
    phone: s(formData, 'phone') || undefined,
    servesCustomersInPerson: b(formData, 'servesCustomersInPerson'),
    serviceAreas: csv(formData, 'serviceAreas'),
  });
  if (!res.ok) return fail(res.error);
  revalidatePath('/local');
  return { ok: true, message: `Google Business Profile eligibility: ${res.value.eligibility.eligible === null ? 'unknown' : res.value.eligibility.eligible ? 'eligible' : 'not eligible'}.`, detail: res.value.eligibility.reason };
}

export async function submitIndexNowAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const urls = csv(formData, 'urls');
  const res = await core.submitIndexNow(ctx.d, ctx.projectId, urls);
  if (!res.ok) return fail(res.error);
  return { ok: res.value.accepted, message: `Endpoint returned HTTP ${res.value.status} for ${res.value.submitted} URL(s).`, detail: res.value.meaning };
}

export async function generateReportAction(_prev: ActionState | null, formData: FormData): Promise<ActionState> {
  const ctx = await scoped();
  if (!ctx) return fail('No active project.');
  const period = (s(formData, 'period') || 'weekly') as core.Period;
  const res = core.buildReport(ctx.d, ctx.projectId, period);
  if (!res.ok) return fail(res.error);
  const md = core.reportToMarkdown(res.value);
  core.saveReport(ctx.d, ctx.projectId, res.value, 'markdown', md);
  revalidatePath('/reports');
  return { ok: true, message: `${period} report generated and saved.` };
}
