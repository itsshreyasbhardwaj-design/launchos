import { openDb, setSharedDb, type Db } from '../src/core/db';
import { createProject, authorizeDomain, updateBrand, addAsset } from '../src/core/services/projects';
import { seedRegistry } from '../src/core/services/registry';

export function freshDb(): Db {
  const d = openDb(':memory:');
  setSharedDb(d);
  seedRegistry(d);
  return d;
}

export async function seedProject(d: Db, over: Record<string, unknown> = {}): Promise<string> {
  const res = await createProject(d, {
    name: (over.name as string) ?? 'Test Product',
    websiteUrl: (over.websiteUrl as string) ?? 'https://example.com',
    preset: (over.preset as 'saas') ?? 'saas',
    category: (over.category as string) ?? 'developer tooling',
    country: (over.country as string) ?? 'IN',
    launchStatus: (over.launchStatus as 'launched') ?? 'launched',
  });
  if (!res.ok) throw new Error(res.error);
  return res.value.id;
}

export function fillBrand(d: Db, projectId: string, over: Record<string, unknown> = {}): void {
  const fields = {
    tagline: 'Route work without meetings',
    shortDescription: 'A free, open-source task router for small engineering teams.',
    longDescription: 'Routes incoming work using rules you write. Runs locally. No subscription.',
    valueProposition: 'Cut triage time without another SaaS bill.',
    targetAudience: 'Engineering leads at teams of 5 to 50',
    problemsSolved: 'Triage eats an hour a day. Work sits unassigned.',
    features: ['Rule-based routing', 'Local-first storage', 'Digests'],
    pricingModel: 'Free and open source',
    logoPath: './assets/logo.png',
    ...over,
  };
  const r = updateBrand(d, projectId, fields as never);
  if (!r.ok) throw new Error(r.error);
  const verified: Record<string, string> = {};
  for (const k of Object.keys(fields)) verified[k] = 'test fixture';
  verified.brandName = 'test fixture';
  const v = updateBrand(d, projectId, { verifiedFields: verified });
  if (!v.ok) throw new Error(v.error);
}

export function addScreenshots(d: Db, projectId: string, n = 3): void {
  for (let i = 0; i < n; i++) {
    const r = addAsset(d, projectId, { kind: 'screenshot', label: `shot ${i}`, pathOrUrl: `./shots/${i}.png` });
    if (!r.ok) throw new Error(r.error);
  }
}

export function authorize(d: Db, projectId: string, host = 'example.com'): void {
  const r = authorizeDomain(d, projectId, host, 'test fixture', 'tester');
  if (!r.ok) throw new Error(r.error);
}

/** Builds a FetchedPage-shaped object for extractor and check tests. */
export function fakePage(over: Record<string, unknown> = {}) {
  return {
    requestedUrl: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    redirectChain: [],
    headers: { 'content-type': 'text/html; charset=utf-8' },
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="en"><head><title>T</title></head><body><h1>H</h1></body></html>',
    bytes: 100,
    elapsedMs: 50,
    truncated: false,
    ...over,
  } as never;
}
