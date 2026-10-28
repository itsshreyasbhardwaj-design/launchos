import { j, logEvent, type Db } from '../db';
import { clampText, err, newId, nowIso, ok, today, type Result } from '../util';
import { presetOf } from '../presets';
import { countAssets, getBrand, getProject, type BrandProfile, type Project } from './projects';
import { getDirectory, listDirectories, type DirectoryRecord } from './registry';

export type Eligibility = 'eligible' | 'needs_check' | 'not_eligible' | 'paid_only';

export type MatchResult = {
  directory: DirectoryRecord;
  eligible: Eligibility;
  relevance: number;
  reasons: string[];
  blockers: string[];
};

/**
 * Decides which destinations are worth this project's time.
 *
 * Deliberately conservative: anything LaunchOS cannot establish becomes
 * 'needs_check' with the question spelled out, rather than a confident yes.
 */
export function matchDirectories(d: Db, projectId: string): Result<MatchResult[]> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const brand = getBrand(d, projectId);
  const preset = presetOf(project.preset);
  const local = d.get<Record<string, unknown>>('SELECT * FROM local_profiles WHERE project_id = ?', projectId);
  const results: MatchResult[] = [];

  for (const dir of listDirectories(d)) {
    const reasons: string[] = [];
    const blockers: string[] = [];
    let relevance = 0;

    if (dir.presets.includes(project.preset)) {
      relevance += 45;
      reasons.push(`Matches the ${preset.label} preset.`);
    } else {
      blockers.push(`Not listed as relevant to the ${preset.label} preset.`);
    }

    const catRank = preset.directoryCategories.indexOf(dir.category);
    if (catRank >= 0) {
      relevance += Math.max(5, 30 - catRank * 5);
      reasons.push(`"${dir.category}" is priority ${catRank + 1} for this preset.`);
    }

    relevance += dir.priority === 'high' ? 15 : dir.priority === 'medium' ? 8 : 3;

    const geo = dir.geography.toLowerCase();
    const country = (project.country ?? '').toUpperCase();
    if (geo !== 'global') {
      if (country && geo.includes(country.toLowerCase())) {
        relevance += 12;
        reasons.push(`Geographically relevant to ${country}.`);
      } else if (country) {
        blockers.push(`Covers ${dir.geography}, but this project targets ${country}.`);
        relevance -= 20;
      } else {
        blockers.push(`Covers ${dir.geography}; set the project country to confirm relevance.`);
      }
    }

    // --- eligibility gates ---
    let eligible: Eligibility = 'eligible';

    if (dir.freeSubmission === 'paid') {
      eligible = 'paid_only';
      blockers.push('Submission requires payment. LaunchOS will not recommend spending money.');
    } else if (dir.freeSubmission === 'unknown') {
      eligible = 'needs_check';
      blockers.push(`Whether free submission exists is unverified. Check ${dir.officialUrl} and record the answer with "launchos directories confirm".`);
    } else if (dir.freeSubmission === 'freemium') {
      reasons.push('A free tier exists alongside paid upgrades; confirm the free path covers what you need.');
    }

    if (!dir.submissionUrl && dir.submissionMethod !== 'package_registry') {
      if (eligible === 'eligible') eligible = 'needs_check';
      blockers.push('No verified submission URL on record. Find the official submission path before preparing assets.');
    }

    const el = dir.eligibility as Record<string, unknown>;
    if (el.inPersonCustomerContact === true || el.onlineOnlyBusinessesNotEligible === true) {
      const servesInPerson = local?.serves_customers_in_person === 1;
      if (!servesInPerson) {
        eligible = 'not_eligible';
        blockers.push(
          'This destination requires in-person customer contact. No local profile on this project records that, ' +
          'so LaunchOS treats the project as online-only. Creating a location you do not have would violate the platform guidelines.'
        );
      } else {
        reasons.push('The local profile records in-person customer contact, which satisfies the eligibility requirement.');
      }
    }
    if (el.fullyFreeSoftware === true && !brand?.githubUrl) {
      eligible = eligible === 'eligible' ? 'needs_check' : eligible;
      blockers.push('Requires fully free software. No public repository is recorded on the brand profile.');
    }
    if (el.registeredNonprofit === true && project.preset !== 'nonprofit') {
      eligible = 'not_eligible';
      blockers.push('Restricted to registered nonprofits.');
    }
    if (el.registeredIndianNgo === true && country !== 'IN') {
      eligible = 'not_eligible';
      blockers.push('Restricted to Indian registered NGOs.');
    }
    if (el.inviteOnlyAccount === true) {
      eligible = eligible === 'eligible' ? 'needs_check' : eligible;
      blockers.push('Accounts are invite-only. Only plan this if you are already a member in good standing.');
    }
    if (el.liveProduct === true || el.publiclyAvailableProduct === true || el.productMustBeUsable === true || el.mustBeTryable === true) {
      if (project.launchStatus === 'pre_launch') {
        eligible = eligible === 'eligible' ? 'needs_check' : eligible;
        blockers.push('Requires a product people can actually use; this project is still marked pre-launch.');
      }
    }
    if (el.subredditRulesPermitSelfPromotion === 'must_be_checked_per_subreddit') {
      eligible = eligible === 'eligible' ? 'needs_check' : eligible;
      blockers.push('Self-promotion rules differ per community. Record the specific community and its rules before planning anything.');
    }

    if (!project.websiteUrl && dir.category !== 'package_registry') {
      blockers.push('No website URL on the project; most destinations require one.');
      if (eligible === 'eligible') eligible = 'needs_check';
    }

    if (relevance <= 0 && eligible !== 'not_eligible') eligible = 'not_eligible';

    results.push({ directory: dir, eligible, relevance: Math.max(0, Math.min(100, relevance)), reasons, blockers });
  }

  results.sort((a, b) => b.relevance - a.relevance || a.directory.name.localeCompare(b.directory.name));

  d.tx(() => {
    for (const r of results) {
      d.run(
        `INSERT INTO directory_eligibility (id, project_id, directory_id, eligible, relevance, reasons_json, blockers_json, evaluated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT (project_id, directory_id) DO UPDATE SET
           eligible=excluded.eligible, relevance=excluded.relevance, reasons_json=excluded.reasons_json,
           blockers_json=excluded.blockers_json, evaluated_at=excluded.evaluated_at`,
        newId('elig'), projectId, r.directory.id, r.eligible, r.relevance,
        j.stringify(r.reasons), j.stringify(r.blockers), nowIso()
      );
    }
  });
  logEvent(d, { projectId, actor: 'system', action: 'directories.matched', detail: { count: results.length } });
  return ok(results);
}

// ---------------------------------------------------------------- listing drafts

export const LISTING_STATUSES = [
  'not_researched', 'eligibility_confirmed', 'content_ready', 'awaiting_approval',
  'ready_for_submission', 'submitted', 'pending_review', 'live', 'rejected',
  'needs_update', 'not_eligible', 'paid_only', 'discontinued',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type ListingDraft = {
  id: string;
  projectId: string;
  directoryId: string;
  directorySlug: string;
  directoryName: string;
  fields: Record<string, string>;
  warnings: string[];
  assetChecklist: string[];
  brandRevision: number;
  status: ListingStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  updatedAt: string;
};

/**
 * Builds listing copy for one destination from the canonical brand profile.
 *
 * Only facts recorded on the brand profile are used. Missing fields become
 * explicit warnings — nothing is invented to fill a field, and nothing is
 * padded to reach a character count.
 */
export function prepareListing(d: Db, projectId: string, directorySlug: string): Result<ListingDraft> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const brand = getBrand(d, projectId);
  if (!brand) return err(`no brand profile for project ${projectId}`);
  const dir = getDirectory(d, directorySlug);
  if (!dir) return err(`no directory "${directorySlug}"`);

  const elig = d.get<Record<string, unknown>>(
    'SELECT * FROM directory_eligibility WHERE project_id = ? AND directory_id = ?', projectId, dir.id
  );
  const eligState = (elig?.eligible as Eligibility) ?? 'needs_check';

  const warnings: string[] = [];
  if (!elig) warnings.push('Eligibility has not been evaluated yet. Run directory matching first.');
  if (eligState === 'not_eligible') warnings.push('Eligibility check says this project does not qualify. Do not submit.');
  if (eligState === 'paid_only') warnings.push('Submission is paid. LaunchOS prepared the copy, but will not mark it ready.');
  if (eligState === 'needs_check') warnings.push('Eligibility is unresolved: ' + j.parse<string[]>(elig?.blockers_json, []).join(' '));

  const limits = dir.fieldLimits;
  const limit = (k: string, fallback: number): number => {
    const v = limits[k];
    return typeof v === 'number' ? v : fallback;
  };

  const fields: Record<string, string> = {};
  const need = (key: string, value: string | null | undefined, label: string, max?: number): void => {
    if (!value || !value.trim()) {
      warnings.push(`${label} is empty on the brand profile. Fill it in rather than inventing copy.`);
      return;
    }
    const clamped = max ? clampText(value, max) : value.trim();
    if (max && value.trim().length > max) {
      warnings.push(`${label} was ${value.trim().length} characters and was trimmed to the ${max}-character limit. Review the result.`);
    }
    fields[key] = clamped;
  };

  need('name', brand.brandName, 'Brand name', limit('name', limit('businessName', 60)));
  need('tagline', brand.tagline, 'Tagline', limit('tagline', 80));
  need('short_description', brand.shortDescription, 'Short description', limit('shortDescription', limit('description', 200)));
  need('long_description', brand.longDescription, 'Long description', limit('longDescription', limit('description', 1200)));
  need('value_proposition', brand.valueProposition, 'Value proposition');
  need('target_audience', brand.targetAudience, 'Target audience');
  need('category', project.category ?? dir.category, 'Category');
  if (project.websiteUrl) fields.website = project.websiteUrl;
  else warnings.push('No website URL on the project.');

  if (brand.features.length) fields.features = brand.features.slice(0, 8).join('\n');
  else warnings.push('No features recorded on the brand profile.');

  if (brand.pricingModel) {
    fields.pricing = [brand.pricingModel, brand.pricingDetail].filter(Boolean).join(' — ');
  } else {
    warnings.push('No pricing recorded. Never guess a price for a public listing.');
  }

  if (brand.contactPublic && brand.contactEmail) fields.contact_email = brand.contactEmail;
  else if (brand.contactEmail) warnings.push('A contact email exists but is not marked public, so it was left out.');

  if (brand.githubUrl) fields.repository = brand.githubUrl;
  if (brand.languages.length) fields.languages = brand.languages.join(', ');

  const unverified = Object.keys(fields).filter((k) => {
    const m: Record<string, string> = { name: 'brandName', tagline: 'tagline', short_description: 'shortDescription', long_description: 'longDescription', pricing: 'pricingModel' };
    const bf = m[k];
    return bf && !brand.verifiedFields[bf];
  });
  if (unverified.length) {
    warnings.push(`These fields are not marked verified on the brand profile: ${unverified.join(', ')}. Verify them before anything is published.`);
  }

  const assetChecklist = assetsFor(d, projectId, dir, brand);
  const missingAssets = assetChecklist.filter((a) => a.startsWith('MISSING'));
  const status: ListingStatus =
    eligState === 'not_eligible' ? 'not_eligible'
    : eligState === 'paid_only' ? 'paid_only'
    : warnings.length || missingAssets.length ? 'eligibility_confirmed'
    : 'content_ready';

  const existing = d.get<{ id: string; status: string }>(
    'SELECT id, status FROM listing_drafts WHERE project_id = ? AND directory_id = ?', projectId, dir.id
  );
  const ts = nowIso();
  // A listing that is already published is never silently overwritten: it goes
  // to needs_update so the operator decides what to change upstream.
  const finalStatus: ListingStatus =
    existing && ['submitted', 'pending_review', 'live'].includes(existing.status) ? 'needs_update' : status;

  if (existing) {
    d.run(
      `UPDATE listing_drafts SET fields_json=?, warnings_json=?, asset_checklist_json=?, brand_revision=?, status=?, updated_at=? WHERE id=?`,
      j.stringify(fields), j.stringify(warnings), j.stringify(assetChecklist), brand.revision, finalStatus, ts, existing.id
    );
  } else {
    d.run(
      `INSERT INTO listing_drafts (id, project_id, directory_id, fields_json, warnings_json, asset_checklist_json, brand_revision, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      newId('draft'), projectId, dir.id, j.stringify(fields), j.stringify(warnings),
      j.stringify(assetChecklist), brand.revision, finalStatus, ts, ts
    );
  }
  logEvent(d, { projectId, actor: 'system', action: 'listing.prepared', target: dir.slug, detail: { status: finalStatus, warnings: warnings.length } });
  return ok(getListing(d, projectId, dir.slug)!);
}

/**
 * Builds the asset checklist from assets the operator has actually recorded.
 *
 * An item is only "OK" when something points at a real file or URL. The
 * approval gate refuses while any MISSING line remains, so this is the single
 * place that decides whether assets exist.
 */
function assetsFor(d: Db, projectId: string, dir: DirectoryRecord, brand: BrandProfile): string[] {
  const out: string[] = [];
  const have = (kind: string): number => countAssets(d, projectId, kind);

  const logo = brand.logoPath || (have('logo') ? `${have('logo')} recorded asset(s)` : '');
  out.push(logo ? `OK logo: ${logo}` : 'MISSING logo — add one: launchos assets add --kind logo --label "square logo" --path <file-or-url>');

  if (['startup_launch', 'saas_discovery', 'software_directory', 'app_discovery', 'ai_product', 'business_software'].includes(dir.category)) {
    const shots = have('screenshot');
    out.push(shots >= 3
      ? `OK screenshots: ${shots} recorded`
      : `MISSING screenshots — ${shots} of 3 recorded. Real product screenshots at 1280x800 or larger: launchos assets add --kind screenshot ...`);
    out.push(have('demo_video') ? `OK demo video: ${have('demo_video')} recorded` : 'OPTIONAL demo video — a 30-60 second screen recording of the real product.');
  }
  if (dir.category === 'app_discovery') {
    out.push(have('icon') ? `OK app icon: ${have('icon')} recorded` : 'MISSING app icon at the store-required resolution.');
  }
  if (dir.category === 'local_listing') {
    out.push(have('premises_photo') >= 2
      ? `OK premises photos: ${have('premises_photo')} recorded`
      : `MISSING premises photos — ${have('premises_photo')} of 2 recorded. Real photos of the actual location.`);
  }
  out.push(have('social_preview') ? `OK social preview: ${have('social_preview')} recorded` : 'OPTIONAL social preview image at 1200x630 — generate one with "launchos social card".');
  return out;
}

export function getListing(d: Db, projectId: string, directorySlug: string): ListingDraft | null {
  const dir = getDirectory(d, directorySlug);
  if (!dir) return null;
  const r = d.get<Record<string, unknown>>('SELECT * FROM listing_drafts WHERE project_id = ? AND directory_id = ?', projectId, dir.id);
  return r ? rowToDraft(r, dir) : null;
}

export function listListings(d: Db, projectId: string): ListingDraft[] {
  const rows = d.all<Record<string, unknown>>(
    `SELECT ld.*, dr.slug AS dir_slug, dr.name AS dir_name FROM listing_drafts ld
     JOIN directory_registry dr ON dr.id = ld.directory_id
     WHERE ld.project_id = ? ORDER BY ld.updated_at DESC`, projectId
  );
  return rows.map((r) => ({
    id: r.id as string,
    projectId: r.project_id as string,
    directoryId: r.directory_id as string,
    directorySlug: r.dir_slug as string,
    directoryName: r.dir_name as string,
    fields: j.parse<Record<string, string>>(r.fields_json, {}),
    warnings: j.parse<string[]>(r.warnings_json, []),
    assetChecklist: j.parse<string[]>(r.asset_checklist_json, []),
    brandRevision: Number(r.brand_revision ?? 1),
    status: r.status as ListingStatus,
    approvedBy: (r.approved_by as string) ?? null,
    approvedAt: (r.approved_at as string) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

const rowToDraft = (r: Record<string, unknown>, dir: DirectoryRecord): ListingDraft => ({
  id: r.id as string,
  projectId: r.project_id as string,
  directoryId: r.directory_id as string,
  directorySlug: dir.slug,
  directoryName: dir.name,
  fields: j.parse<Record<string, string>>(r.fields_json, {}),
  warnings: j.parse<string[]>(r.warnings_json, []),
  assetChecklist: j.parse<string[]>(r.asset_checklist_json, []),
  brandRevision: Number(r.brand_revision ?? 1),
  status: r.status as ListingStatus,
  approvedBy: (r.approved_by as string) ?? null,
  approvedAt: (r.approved_at as string) ?? null,
  updatedAt: r.updated_at as string,
});

/** Explicit human approval. Without it a listing can never reach ready_for_submission. */
export function approveListing(d: Db, projectId: string, directorySlug: string, by: string): Result<ListingDraft> {
  const draft = getListing(d, projectId, directorySlug);
  if (!draft) return err(`no listing draft for ${directorySlug}`);
  if (!by.trim()) return err('an approver name is required: approval must be attributable to a person');
  if (draft.status === 'not_eligible') return err('this project is not eligible for that destination; approval refused');
  if (draft.status === 'paid_only') return err('submission is paid; approval refused. Use "directories confirm" if you have established a free path.');
  if (draft.warnings.length) {
    return err(`listing still has ${draft.warnings.length} warning(s). Resolve them first:\n- ${draft.warnings.join('\n- ')}`);
  }
  // The same conditions that keep a draft out of 'content_ready' must also
  // block approval, or the status field and the gate disagree.
  const missingAssets = draft.assetChecklist.filter((a) => a.startsWith('MISSING'));
  if (missingAssets.length) {
    return err(
      `listing is missing ${missingAssets.length} required asset(s). Record them on the brand profile or gather them first:\n- ` +
      missingAssets.join('\n- ') +
      '\n\nThen re-run "launchos listings prepare ' + directorySlug + '".'
    );
  }
  if (draft.status !== 'content_ready' && draft.status !== 'needs_update') {
    return err(`listing status is "${draft.status}"; only a content_ready (or needs_update) listing can be approved. Re-run "launchos listings prepare ${directorySlug}".`);
  }
  d.run(
    "UPDATE listing_drafts SET status = 'ready_for_submission', approved_by = ?, approved_at = ? WHERE id = ?",
    by, nowIso(), draft.id
  );
  logEvent(d, { projectId, actor: by, action: 'listing.approved', target: directorySlug });
  return ok(getListing(d, projectId, directorySlug)!);
}

/**
 * Records that a human submitted the listing. LaunchOS does not submit: no
 * destination here exposes an authorized submission API to us, so the operator
 * completes the form and reports back.
 */
export function recordSubmission(
  d: Db,
  projectId: string,
  directorySlug: string,
  input: { method: 'manual' | 'api_authorized'; submittedAt?: string; note?: string }
): Result<{ submissionId: string }> {
  const draft = getListing(d, projectId, directorySlug);
  if (!draft) return err(`no listing draft for ${directorySlug}`);
  if (draft.status !== 'ready_for_submission' && draft.status !== 'needs_update') {
    return err(`listing status is "${draft.status}"; only an approved (ready_for_submission) listing can be recorded as submitted`);
  }
  const id = newId('sub');
  d.run(
    `INSERT INTO listing_submissions (id, draft_id, project_id, status, method, submitted_at, note, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id, draft.id, projectId, 'submitted', input.method, input.submittedAt ?? today(), input.note ?? null, nowIso()
  );
  d.run("UPDATE listing_drafts SET status = 'submitted', updated_at = ? WHERE id = ?", nowIso(), draft.id);
  logEvent(d, { projectId, actor: 'user', action: 'listing.submitted', target: directorySlug, detail: { submissionId: id } });
  return ok({ submissionId: id });
}

/**
 * Attaches evidence and, where the evidence is a live URL, verifies it by
 * fetching the page and looking for the brand name. A listing only becomes
 * "live" on verified evidence.
 */
export async function recordEvidence(
  d: Db,
  submissionId: string,
  input: { kind: 'live_url' | 'screenshot' | 'email_confirmation' | 'note'; reference: string; observedOn?: string }
): Promise<Result<{ verified: boolean; detail: string; status: ListingStatus }>> {
  const sub = d.get<Record<string, unknown>>('SELECT * FROM listing_submissions WHERE id = ?', submissionId);
  if (!sub) return err(`no submission ${submissionId}`);
  const projectId = sub.project_id as string;
  const brand = getBrand(d, projectId);

  let verified = false;
  let detail = 'Recorded without automated verification; the operator vouches for it.';

  if (input.kind === 'live_url') {
    const { safeFetch } = await import('../net/safe-fetch');
    const res = await safeFetch(input.reference, { maxBytes: 600_000 });
    if (!res.ok) detail = `Could not fetch the URL: ${res.error}`;
    else if (res.value.status >= 400) detail = `URL returned HTTP ${res.value.status}, so the listing is not live.`;
    else {
      const body = res.value.body.toLowerCase();
      const needle = (brand?.brandName ?? '').toLowerCase();
      if (needle && body.includes(needle)) {
        verified = true;
        detail = `HTTP ${res.value.status} and the page body contains "${brand!.brandName}".`;
      } else {
        detail = `HTTP ${res.value.status}, but "${brand?.brandName ?? 'the brand name'}" was not found in the page body. Not marking this live.`;
      }
    }
  }

  d.run(
    `INSERT INTO listing_evidence (id, submission_id, kind, reference, observed_on, verified, verification_detail, created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    newId('evi'), submissionId, input.kind, input.reference, input.observedOn ?? today(),
    verified ? 1 : 0, detail, nowIso()
  );

  const draftId = sub.draft_id as string;
  let status: ListingStatus = 'pending_review';
  if (verified) {
    status = 'live';
    d.run("UPDATE listing_submissions SET status = 'live', live_url = ? WHERE id = ?", input.reference, submissionId);
  }
  d.run('UPDATE listing_drafts SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), draftId);
  logEvent(d, { projectId, actor: 'user', action: 'listing.evidence', target: submissionId, detail: { verified, kind: input.kind } });
  return ok({ verified, detail, status });
}

/**
 * Change propagation: when verified brand facts move on, every published or
 * prepared listing built from the old revision is flagged for update. Nothing
 * already public is rewritten automatically.
 */
export function propagateBrandChange(d: Db, projectId: string, changedFields: string[]): { flagged: { directorySlug: string; status: ListingStatus }[]; tasks: number } {
  const brand = getBrand(d, projectId);
  if (!brand || !changedFields.length) return { flagged: [], tasks: 0 };
  const stale = listListings(d, projectId).filter((l) => l.brandRevision < brand.revision);
  const flagged: { directorySlug: string; status: ListingStatus }[] = [];
  let tasks = 0;

  for (const l of stale) {
    const next: ListingStatus = ['submitted', 'pending_review', 'live'].includes(l.status) ? 'needs_update' : l.status;
    d.run('UPDATE listing_drafts SET status = ?, updated_at = ? WHERE id = ?', next, nowIso(), l.id);
    flagged.push({ directorySlug: l.directorySlug, status: next });
    const ts = nowIso();
    d.run(
      `INSERT INTO tasks (id, project_id, title, detail, area, kind, priority_score, status, requires_approval, source, source_ref, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId('task'), projectId,
      `Update the ${l.directoryName} listing`,
      `These verified brand fields changed: ${changedFields.join(', ')}. The listing on ${l.directoryName} was built from brand revision ${l.brandRevision}; the current revision is ${brand.revision}. Review the regenerated copy, then update the live listing yourself.`,
      'listings', 'update', 60, 'open', 1, 'brand_change', l.id, ts, ts
    );
    tasks++;
  }
  if (flagged.length) logEvent(d, { projectId, actor: 'system', action: 'listing.propagate', detail: { flagged: flagged.length, changedFields } });
  return { flagged, tasks };
}

/** The exact instructions the operator follows to submit by hand. */
export function submissionInstructions(d: Db, projectId: string, directorySlug: string): Result<{ directory: DirectoryRecord; draft: ListingDraft; steps: string[] }> {
  const dir = getDirectory(d, directorySlug);
  if (!dir) return err(`no directory "${directorySlug}"`);
  const draft = getListing(d, projectId, directorySlug);
  if (!draft) return err(`no listing draft for ${directorySlug}; prepare it first`);

  const steps: string[] = [];
  steps.push(dir.submissionUrl ? `Open the official submission page: ${dir.submissionUrl}` : `Find the official submission path starting from ${dir.officialUrl}, then record it with "launchos directories confirm ${dir.slug} --submission-url <url>".`);
  if (dir.accountRequired) steps.push('Sign in with your own account. LaunchOS will not create accounts for you.');
  steps.push('Copy each field below exactly as shown. The copy is built from your verified brand profile.');
  for (const [k, v] of Object.entries(draft.fields)) steps.push(`  ${k} (${v.length} chars): ${v}`);
  for (const a of draft.assetChecklist) steps.push(`  asset: ${a}`);
  if (dir.restrictions) steps.push(`Platform restrictions you must respect: ${dir.restrictions}`);
  if (dir.approvalRequired) steps.push('Expect a moderation queue. Do not record this as live until you can see it published.');
  steps.push(`When it is submitted, run: launchos listings submitted ${directorySlug} --project <project>`);
  steps.push(`When it is visibly published, attach evidence: launchos listings evidence <submission-id> --live-url <url>`);
  return ok({ directory: dir, draft, steps });
}
