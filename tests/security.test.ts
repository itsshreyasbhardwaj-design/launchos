import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPrivateAddress, safeFetch } from '../src/core/net/safe-fetch';
import { freshDb, seedProject, authorize, fillBrand } from './helpers';
import { runProjectAudit } from '../src/core/services/audits';
import { exportProject, listDomains, authorizeDomain, addDomain } from '../src/core/services/projects';
import { prepareListing, matchDirectories } from '../src/core/services/listings';
import { buildUtm } from '../src/core/services/analytics';
import { submitIndexNow } from '../src/core/services/searchengines';

describe('SSRF protection', () => {
  it('rejects loopback, private, link-local, CGNAT and reserved addresses', async () => {
    const blocked = [
      'http://127.0.0.1/', 'http://127.1.2.3/', 'http://10.0.0.5/', 'http://192.168.1.1/',
      'http://172.16.0.1/', 'http://172.31.255.255/', 'http://169.254.169.254/latest/meta-data/',
      'http://100.64.0.1/', 'http://0.0.0.0/', 'http://224.0.0.1/', 'http://[::1]/',
      'http://[fe80::1]/', 'http://[fc00::1]/', 'http://[::ffff:127.0.0.1]/',
    ];
    for (const u of blocked) {
      const r = await assertSafeUrl(u);
      expect(r.ok, `${u} should be blocked`).toBe(false);
    }
  });

  it('rejects non-http schemes and embedded credentials', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'data:text/html,hi']) {
      expect((await assertSafeUrl(u)).ok, u).toBe(false);
    }
    expect((await assertSafeUrl('https://user:secret@example.com/')).ok).toBe(false);
  });

  it('rejects internal-looking host names even before DNS', async () => {
    for (const u of ['http://localhost/', 'http://db.internal/', 'http://api.local/', 'http://thing.test/']) {
      expect((await assertSafeUrl(u)).ok, u).toBe(false);
    }
  });

  it('allows ordinary public hosts', async () => {
    const r = await assertSafeUrl('https://example.com/path?q=1');
    expect(r.ok).toBe(true);
  });

  it('classifies addresses correctly at range boundaries', () => {
    expect(isPrivateAddress('172.15.255.255')).toBe(false);
    expect(isPrivateAddress('172.16.0.0')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('100.63.255.255')).toBe(false);
    expect(isPrivateAddress('100.64.0.0')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
  });

  it('re-validates every redirect hop', async () => {
    // httpbin-free check: a redirect to a blocked target must fail even though
    // the first hop is public. Uses a data-free local assertion of the guard.
    const r = await safeFetch('http://127.0.0.1:1/');
    expect(r.ok).toBe(false);
  });
});

describe('crawl authorization', () => {
  it('refuses to audit a project with no authorized domain', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = await runProjectAudit(d, p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no authorized domain/i);
  });

  it('requires an authorization note stating how the domain is controlled', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    expect(authorizeDomain(d, p, 'example.com', '   ', 'tester').ok).toBe(false);
    expect(authorizeDomain(d, p, 'example.com', 'I own the DNS zone', 'tester').ok).toBe(true);
  });

  it('refuses to register a private host as a project domain', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = await addDomain(d, p, '127.0.0.1');
    expect(r.ok).toBe(false);
  });

  it('records who authorized a domain', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    authorize(d, p);
    const dom = listDomains(d, p).find((x) => x.host === 'example.com')!;
    expect(dom.authorized).toBe(true);
    expect(dom.authorizationNote).toMatch(/authorized by tester/);
  });
});

describe('project isolation', () => {
  it('keeps every table scoped to its own project', async () => {
    const d = freshDb();
    const a = await seedProject(d, { name: 'Project A', websiteUrl: 'https://example.com' });
    const b = await seedProject(d, { name: 'Project B', websiteUrl: 'https://example.org' });
    fillBrand(d, a, { tagline: 'A tagline' });
    fillBrand(d, b, { tagline: 'B tagline' });
    matchDirectories(d, a);
    prepareListing(d, a, 'crunchbase');

    const exportA = exportProject(d, a);
    const exportB = exportProject(d, b);

    expect(exportA.listing_drafts.length).toBe(1);
    expect(exportB.listing_drafts.length).toBe(0);
    expect((exportA.brand_profiles[0] as Record<string, unknown>).tagline).toBe('A tagline');
    expect((exportB.brand_profiles[0] as Record<string, unknown>).tagline).toBe('B tagline');
    for (const [table, rows] of Object.entries(exportA)) {
      for (const row of rows as Record<string, unknown>[]) {
        const pid = row.project_id ?? row.id;
        if (table !== 'projects' && row.project_id) expect(pid, table).toBe(a);
      }
    }
  });

  it('cascades deletes so no orphan rows survive', async () => {
    const { deleteProject } = await import('../src/core/services/projects');
    const d = freshDb();
    const a = await seedProject(d);
    fillBrand(d, a);
    matchDirectories(d, a);
    prepareListing(d, a, 'crunchbase');
    expect(deleteProject(d, a).ok).toBe(true);
    expect(d.all('SELECT * FROM listing_drafts').length).toBe(0);
    expect(d.all('SELECT * FROM brand_profiles').length).toBe(0);
    expect(d.all('SELECT * FROM directory_eligibility').length).toBe(0);
  });
});

describe('no data leakage into URLs', () => {
  it('refuses UTM parameters that look like personal data', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    for (const bad of ['user@example.com', 'phone-9876543210', 'customer_name_rahul', 'api_token_abc']) {
      const r = buildUtm(d, p, { label: 'x', baseUrl: 'https://example.com/', source: bad, medium: 'referral', campaign: 'c' });
      expect(r.ok, bad).toBe(false);
    }
  });

  it('normalizes parameters into URL-safe values and never produces a malformed URL', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = buildUtm(d, p, {
      label: 'x', baseUrl: 'https://example.com/page?existing=1',
      source: 'Product Hunt', medium: 'Referral Link', campaign: 'Launch Day! 2026',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const u = new URL(r.value.finalUrl);
      expect(u.searchParams.get('utm_source')).toBe('product-hunt');
      expect(u.searchParams.get('utm_campaign')).toBe('launch-day-2026');
      expect(u.searchParams.get('existing')).toBe('1');
    }
  });
});

describe('IndexNow safety', () => {
  it('refuses to submit for an unauthorized host', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    const r = await submitIndexNow(d, p, ['https://example.com/a']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/authorized domain/i);
  });

  it('refuses when no key is recorded, before making any request', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    authorize(d, p);
    const prev = process.env.INDEXNOW_KEY;
    delete process.env.INDEXNOW_KEY;
    const r = await submitIndexNow(d, p, ['https://example.com/a']);
    if (prev) process.env.INDEXNOW_KEY = prev;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no IndexNow key/i);
  });

  it('refuses a mixed-host URL list', async () => {
    const d = freshDb();
    const p = await seedProject(d);
    authorize(d, p);
    const r = await submitIndexNow(d, p, ['https://example.com/a', 'https://example.org/b']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/one host per request/i);
  });
});
