import { intOf, j, type Db } from '../db';
import { DIRECTORY_SEEDS, type DirectorySeed, type FreeStatus } from '../data/directories';
import { TOOL_SEEDS } from '../data/tools';
import { safeFetch } from '../net/safe-fetch';
import { newId, nowIso, today, type Result, ok } from '../util';

export type DirectoryRecord = DirectorySeed & {
  id: string;
  verificationStatus: 'unverified' | 'url_reachable' | 'url_unreachable' | 'operator_confirmed';
  lastVerified: string | null;
  updatedAt: string;
};

/** Idempotent: re-seeding refreshes catalogue facts but never resets operator confirmations. */
export function seedRegistry(d: Db): { directories: number; tools: number } {
  let dirs = 0;
  for (const s of DIRECTORY_SEEDS) {
    const existing = d.get<{ id: string; verification_status: string }>('SELECT id, verification_status FROM directory_registry WHERE slug = ?', s.slug);
    const ts = nowIso();
    if (existing) {
      if (existing.verification_status === 'operator_confirmed') continue;
      d.run(
        `UPDATE directory_registry SET name=?, official_url=?, submission_url=?, category=?, audience=?, geography=?,
         free_submission=?, account_required=?, approval_required=?, submission_method=?, eligibility_json=?,
         restrictions=?, presets_json=?, priority=?, field_limits_json=?, verification_source=?, notes=?, updated_at=? WHERE id=?`,
        s.name, s.officialUrl, s.submissionUrl, s.category, s.audience, s.geography,
        s.freeSubmission, intOf(s.accountRequired), intOf(s.approvalRequired), s.submissionMethod,
        j.stringify(s.eligibility), s.restrictions ?? null, j.stringify(s.presets), s.priority,
        j.stringify(s.fieldLimits), s.verificationSource, s.notes ?? null, ts, existing.id
      );
      continue;
    }
    d.run(
      `INSERT INTO directory_registry (id, slug, name, official_url, submission_url, category, audience, geography,
       free_submission, account_required, approval_required, submission_method, eligibility_json, restrictions,
       presets_json, priority, field_limits_json, verification_status, verification_source, last_verified, notes, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId('dir'), s.slug, s.name, s.officialUrl, s.submissionUrl, s.category, s.audience, s.geography,
      s.freeSubmission, intOf(s.accountRequired), intOf(s.approvalRequired), s.submissionMethod,
      j.stringify(s.eligibility), s.restrictions ?? null, j.stringify(s.presets), s.priority,
      j.stringify(s.fieldLimits), 'unverified', s.verificationSource, null, s.notes ?? null, ts
    );
    dirs++;
  }

  let tools = 0;
  for (const t of TOOL_SEEDS) {
    if (d.get('SELECT id FROM tool_registry WHERE slug = ?', t.slug)) continue;
    d.run(
      `INSERT INTO tool_registry (id, slug, name, url, category, capability, pricing, free_limits, account_required,
       privacy_note, last_verified, verification_status, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      newId('tool'), t.slug, t.name, t.url, t.category, t.capability, t.pricing, t.freeLimits ?? null,
      intOf(t.accountRequired), t.privacyNote ?? null, null, 'unverified', nowIso()
    );
    tools++;
  }
  return { directories: dirs, tools };
}

export const rowToDirectory = (r: Record<string, unknown>): DirectoryRecord => ({
  id: r.id as string,
  slug: r.slug as string,
  name: r.name as string,
  officialUrl: r.official_url as string,
  submissionUrl: (r.submission_url as string) ?? null,
  category: r.category as string,
  audience: r.audience as string,
  geography: r.geography as string,
  freeSubmission: r.free_submission as FreeStatus,
  accountRequired: r.account_required === 1,
  approvalRequired: r.approval_required === 1,
  submissionMethod: r.submission_method as DirectorySeed['submissionMethod'],
  eligibility: j.parse<Record<string, unknown>>(r.eligibility_json, {}),
  restrictions: (r.restrictions as string) ?? undefined,
  presets: j.parse<string[]>(r.presets_json, []),
  priority: r.priority as DirectorySeed['priority'],
  fieldLimits: j.parse<Record<string, number | string>>(r.field_limits_json, {}),
  verificationStatus: r.verification_status as DirectoryRecord['verificationStatus'],
  verificationSource: r.verification_source as string,
  lastVerified: (r.last_verified as string) ?? null,
  notes: (r.notes as string) ?? undefined,
  updatedAt: r.updated_at as string,
});

export function listDirectories(d: Db, filter?: { category?: string; preset?: string }): DirectoryRecord[] {
  let rows = d.all<Record<string, unknown>>('SELECT * FROM directory_registry ORDER BY priority, name');
  let out = rows.map(rowToDirectory);
  if (filter?.category) out = out.filter((x) => x.category === filter.category);
  if (filter?.preset) out = out.filter((x) => x.presets.includes(filter.preset!));
  return out;
}

export function getDirectory(d: Db, slugOrId: string): DirectoryRecord | null {
  const r =
    d.get<Record<string, unknown>>('SELECT * FROM directory_registry WHERE slug = ?', slugOrId) ??
    d.get<Record<string, unknown>>('SELECT * FROM directory_registry WHERE id = ?', slugOrId);
  return r ? rowToDirectory(r) : null;
}

/**
 * Live-checks registry URLs. This verifies REACHABILITY only — it cannot tell
 * you whether submission is free, which is why that stays a separate field the
 * operator confirms by hand.
 */
export async function verifyDirectories(
  d: Db,
  opts: { limit?: number; onProgress?: (m: string) => void } = {}
): Promise<{ checked: number; reachable: number; unreachable: { slug: string; url: string; detail: string }[] }> {
  const log = opts.onProgress ?? (() => {});
  const rows = listDirectories(d).slice(0, opts.limit ?? 100);
  const unreachable: { slug: string; url: string; detail: string }[] = [];
  let reachable = 0;
  for (const r of rows) {
    const target = r.submissionUrl ?? r.officialUrl;
    log(`checking ${r.slug} -> ${target}`);
    const res = await safeFetch(target, { method: 'GET', maxBytes: 60_000, timeoutMs: 12_000 });
    const okish = res.ok && res.value.status < 400;
    if (okish) reachable++;
    else unreachable.push({ slug: r.slug, url: target, detail: res.ok ? `HTTP ${res.value.status}` : res.error });
    d.run(
      'UPDATE directory_registry SET verification_status = ?, last_verified = ?, updated_at = ? WHERE id = ?',
      okish ? 'url_reachable' : 'url_unreachable', today(), nowIso(), r.id
    );
    await new Promise((x) => setTimeout(x, 400));
  }
  return { checked: rows.length, reachable, unreachable };
}

/** Records that a human checked the listing path and what they found. */
export function confirmDirectory(
  d: Db,
  slug: string,
  patch: { freeSubmission?: FreeStatus; submissionUrl?: string; notes?: string; by: string }
): Result<DirectoryRecord> {
  const dir = getDirectory(d, slug);
  if (!dir) return { ok: false, error: `no directory "${slug}"` };
  d.run(
    `UPDATE directory_registry SET free_submission = ?, submission_url = ?, notes = ?,
     verification_status = 'operator_confirmed', last_verified = ?, verification_source = ?, updated_at = ? WHERE id = ?`,
    patch.freeSubmission ?? dir.freeSubmission,
    patch.submissionUrl ?? dir.submissionUrl,
    patch.notes ?? dir.notes ?? null,
    today(),
    `Confirmed by ${patch.by} on ${today()}`,
    nowIso(),
    dir.id
  );
  return ok(getDirectory(d, slug)!);
}

export type ToolRecord = {
  id: string; slug: string; name: string; url: string; category: string; capability: string;
  pricing: string; freeLimits: string | null; accountRequired: boolean; privacyNote: string | null;
  lastVerified: string | null; verificationStatus: string;
};

export function listTools(d: Db, category?: string): ToolRecord[] {
  const rows = d.all<Record<string, unknown>>('SELECT * FROM tool_registry ORDER BY category, name');
  const out = rows.map((r) => ({
    id: r.id as string, slug: r.slug as string, name: r.name as string, url: r.url as string,
    category: r.category as string, capability: r.capability as string, pricing: r.pricing as string,
    freeLimits: (r.free_limits as string) ?? null, accountRequired: r.account_required === 1,
    privacyNote: (r.privacy_note as string) ?? null, lastVerified: (r.last_verified as string) ?? null,
    verificationStatus: r.verification_status as string,
  }));
  return category ? out.filter((t) => t.category === category) : out;
}
