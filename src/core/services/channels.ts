import { intOf, j, logEvent, type Db } from '../db';
import { clampText, err, newId, nowIso, ok, type Result } from '../util';
import { getBrand, getProject } from './projects';

/** App Store Optimization, local SEO and referral planning. */

export type StoreId = 'apple' | 'google';

const STORE_LIMITS: Record<StoreId, Record<string, number>> = {
  // Long-standing documented limits from App Store Connect / Play Console.
  apple: { appTitle: 30, subtitle: 30, promotionalText: 170, description: 4000, keywordField: 100, releaseNotes: 4000 },
  google: { title: 30, shortDescription: 80, fullDescription: 4000, releaseNotes: 500 },
};

export type AsoListing = {
  store: StoreId;
  fields: Record<string, string>;
  limits: Record<string, number>;
  findings: string[];
  costNote: string;
};

/** Prepares store listing copy from verified brand facts. Planning is free; publishing is not. */
export function prepareAso(d: Db, projectId: string, store: StoreId): Result<AsoListing> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const limits = STORE_LIMITS[store];
  if (!limits) return err(`unknown store "${store}" (use apple or google)`);

  const findings: string[] = [];
  const fields: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined, label: string): void => {
    if (!value?.trim()) { findings.push(`${label} is empty on the brand profile.`); return; }
    const max = limits[key];
    if (max && value.trim().length > max) {
      findings.push(`${label} was ${value.trim().length} characters, over the ${max}-character store limit, and was trimmed. Review it.`);
    }
    fields[key] = max ? clampText(value, max) : value.trim();
  };

  if (store === 'apple') {
    set('appTitle', brand.brandName, 'App title');
    set('subtitle', brand.tagline, 'Subtitle');
    set('promotionalText', brand.valueProposition ?? brand.shortDescription, 'Promotional text');
    set('description', [brand.longDescription, brand.features.length ? `\nFeatures:\n${brand.features.map((f) => `• ${f}`).join('\n')}` : ''].filter(Boolean).join('\n'), 'Description');
    const kw = keywordField(brand.features, project.category, limits.keywordField);
    fields.keywordField = kw.value;
    findings.push(...kw.notes);
  } else {
    set('title', brand.brandName, 'Title');
    set('shortDescription', brand.tagline ?? brand.shortDescription, 'Short description');
    set('fullDescription', [brand.longDescription, brand.features.length ? `\nWhat it does:\n${brand.features.map((f) => `• ${f}`).join('\n')}` : ''].filter(Boolean).join('\n'), 'Full description');
  }

  if (!brand.verifiedFields.brandName) findings.push('The brand name is not marked verified. Store names are hard to change after review.');
  findings.push('Screenshots and preview videos must show the real app. Store review rejects mockups of features that do not exist.');

  d.run(
    `INSERT INTO aso_listings (id, project_id, store, app_title, subtitle, short_description, long_description,
     keyword_field, category, release_notes, locales_json, findings_json, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (project_id, store) DO UPDATE SET app_title=excluded.app_title, subtitle=excluded.subtitle,
       short_description=excluded.short_description, long_description=excluded.long_description,
       keyword_field=excluded.keyword_field, findings_json=excluded.findings_json, updated_at=excluded.updated_at`,
    newId('aso'), projectId, store,
    fields.appTitle ?? fields.title ?? null, fields.subtitle ?? null,
    fields.shortDescription ?? fields.promotionalText ?? null,
    fields.description ?? fields.fullDescription ?? null,
    fields.keywordField ?? null, project.category ?? null, null,
    j.stringify(brand.languages), j.stringify(findings), nowIso()
  );

  return ok({
    store, fields, limits, findings,
    costNote:
      store === 'apple'
        ? 'The Apple Developer Program charges an annual membership fee. LaunchOS prepares this listing for free, but cannot publish an app and will never claim an app is live without actual App Review approval.'
        : 'Google Play charges a one-time developer registration fee. LaunchOS prepares this listing for free, but cannot publish an app and will never claim an app is live without actual store approval.',
  });
}

/** Builds the keyword field from recorded facts. No competitor names, no duplicates of the title. */
function keywordField(features: string[], category: string | null, max: number): { value: string; notes: string[] } {
  const notes: string[] = [];
  const words = [category ?? '', ...features].join(' ').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'your', 'from', 'all', 'any', 'can', 'you', 'app']);
  const unique = [...new Set(words.filter((w) => !stop.has(w)))];
  let value = '';
  for (const w of unique) {
    const next = value ? `${value},${w}` : w;
    if (next.length > max) break;
    value = next;
  }
  notes.push(`Keyword field built from recorded features and category (${value.length}/${max} characters). Do not add competitor brand names — Apple rejects that.`);
  notes.push('Words already in the app title and subtitle do not need repeating in the keyword field.');
  return { value, notes };
}

export function listAso(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM aso_listings WHERE project_id = ?', projectId);
}

// ---------------------------------------------------------------- local SEO

export type LocalEligibility = { eligible: boolean | null; reason: string; requirements: string[] };

/**
 * Records a local business profile and assesses Google Business Profile eligibility.
 *
 * Returns `eligible: false` for online-only operations rather than suggesting a
 * workaround. Inventing a location to qualify is a guidelines violation, and
 * LaunchOS will not help with it.
 */
export function setLocalProfile(
  d: Db,
  projectId: string,
  input: {
    businessName: string; street?: string; city?: string; region?: string; postalCode?: string;
    country?: string; phone?: string; servesCustomersInPerson: boolean; serviceAreas?: string[];
    hours?: Record<string, string>;
  }
): Result<{ eligibility: LocalEligibility }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  if (!input.businessName.trim()) return err('businessName is required');

  const hasAddress = !!(input.street && input.city);
  const hasServiceArea = !!input.serviceAreas?.length;
  let eligibility: LocalEligibility;

  if (!input.servesCustomersInPerson) {
    eligibility = {
      eligible: false,
      reason:
        'Google Business Profile requires that the business makes in-person contact with customers during its stated hours. ' +
        'This project does not. An online-only product is not eligible, and creating an address to qualify would risk suspension.',
      requirements: ['In-person customer contact during stated hours'],
    };
  } else if (hasAddress || hasServiceArea) {
    eligibility = {
      eligible: true,
      reason: hasAddress
        ? 'In-person customer contact plus a street address: this meets the stated requirements for a location-based profile.'
        : 'In-person customer contact plus service areas: this fits a service-area business profile, which has no public address.',
      requirements: ['Verification (postcard, phone, email or video, depending on category)', 'Name matching real-world signage', 'Real photos of the premises or work'],
    };
  } else {
    eligibility = {
      eligible: null,
      reason: 'In-person contact is recorded, but neither a street address nor service areas are. One is required.',
      requirements: ['A street address, or the areas you travel to serve customers'],
    };
  }

  d.run(
    `INSERT INTO local_profiles (id, project_id, business_name, street, city, region, postal_code, country, phone,
     hours_json, service_areas_json, serves_customers_in_person, gbp_eligibility, gbp_eligibility_reason, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT (project_id) DO UPDATE SET business_name=excluded.business_name, street=excluded.street,
       city=excluded.city, region=excluded.region, postal_code=excluded.postal_code, country=excluded.country,
       phone=excluded.phone, hours_json=excluded.hours_json, service_areas_json=excluded.service_areas_json,
       serves_customers_in_person=excluded.serves_customers_in_person, gbp_eligibility=excluded.gbp_eligibility,
       gbp_eligibility_reason=excluded.gbp_eligibility_reason, updated_at=excluded.updated_at`,
    newId('loc'), projectId, input.businessName.trim(), input.street ?? null, input.city ?? null,
    input.region ?? null, input.postalCode ?? null, input.country ?? null, input.phone ?? null,
    j.stringify(input.hours ?? {}), j.stringify(input.serviceAreas ?? []),
    intOf(input.servesCustomersInPerson),
    eligibility.eligible === true ? 'eligible' : eligibility.eligible === false ? 'not_eligible' : 'unknown',
    eligibility.reason, nowIso()
  );
  logEvent(d, { projectId, actor: 'user', action: 'local.profile_set', detail: { eligible: eligibility.eligible } });
  return ok({ eligibility });
}

export function localChecklist(d: Db, projectId: string): Result<{ item: string; status: string; detail: string }[]> {
  const lp = d.get<Record<string, unknown>>('SELECT * FROM local_profiles WHERE project_id = ?', projectId);
  if (!lp) return err('no local profile on this project; set one with "launchos local set"');
  const serviceAreas = j.parse<string[]>(lp.service_areas_json, []);
  const hours = j.parse<Record<string, string>>(lp.hours_json, {});
  return ok([
    { item: 'Business name consistent everywhere', status: lp.business_name ? 'ready' : 'missing', detail: 'Use the real-world name. Adding keywords to it is a guidelines violation.' },
    { item: 'Address or service areas recorded', status: lp.street || serviceAreas.length ? 'ready' : 'missing', detail: String(lp.street ?? serviceAreas.join(', ') ?? '') },
    { item: 'Phone number published', status: lp.phone ? 'ready' : 'missing', detail: 'A local number that a person answers beats a general enquiry form.' },
    { item: 'Opening hours recorded', status: Object.keys(hours).length ? 'ready' : 'missing', detail: 'Hours must match reality: Google Business Profile eligibility depends on being contactable during them.' },
    { item: 'A page per service', status: 'manual', detail: 'One page per service, written for someone deciding. Not one page per city — that is a doorway-page pattern and is penalised.' },
    { item: 'LocalBusiness structured data', status: lp.street ? 'ready' : 'blocked', detail: 'Generate it with "launchos geo schema". It needs a real address — LaunchOS will not invent one.' },
    { item: 'Review responses drafted', status: 'manual', detail: 'Reply to every review, including the bad ones. Never write or buy a review, and check the platform\'s rules before asking for any: Yelp prohibits it outright.' },
    { item: 'GBP eligibility', status: String(lp.gbp_eligibility), detail: String(lp.gbp_eligibility_reason ?? '') },
  ]);
}

// ---------------------------------------------------------------- referral

export function createReferralProgram(
  d: Db,
  projectId: string,
  input: { name: string; incentive: string; disclosure: string; termsUrl?: string; trackingParam?: string }
): Result<{ id: string; landingCopy: string; warnings: string[] }> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  if (!input.incentive.trim()) return err('an incentive is required: say exactly what each side gets');
  if (!input.disclosure.trim()) {
    return err(
      'a disclosure is required. Referral incentives must be disclosed to both sides — that is a legal requirement in ' +
      'many jurisdictions and the basis of the trust the programme depends on.'
    );
  }
  const warnings: string[] = [];
  if (!input.termsUrl) warnings.push('No terms URL. Publish the terms before launching: what qualifies, when the reward lands, and how it can be withdrawn.');
  warnings.push('LaunchOS records only real referral activity. It will never generate referral numbers or simulate payouts.');

  const param = input.trackingParam ?? 'ref';
  const landingCopy = [
    `# Invite someone to ${brand.brandName}`,
    '',
    brand.shortDescription ?? '',
    '',
    `**What you get:** ${input.incentive}`,
    '',
    `**How it works:** share your link. When someone signs up through it, ${input.incentive.toLowerCase()}.`,
    '',
    `_${input.disclosure}_`,
    input.termsUrl ? `\n[Full terms](${input.termsUrl})` : '\n_Terms must be published before this goes live._',
    '',
    `Your link: ${project.websiteUrl ?? 'https://example.com'}?${param}=YOUR_CODE`,
  ].join('\n');

  const id = newId('ref');
  d.run(
    `INSERT INTO referral_programs (id, project_id, name, incentive, disclosure, terms_url, landing_copy, tracking_param, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.name, input.incentive.trim(), input.disclosure.trim(),
    input.termsUrl ?? null, landingCopy, param, 'draft', nowIso()
  );
  return ok({ id, landingCopy, warnings });
}

export function listReferralPrograms(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM referral_programs WHERE project_id = ? ORDER BY created_at DESC', projectId);
}

// ---------------------------------------------------------------- CRO

export type CroFinding = { area: string; status: 'pass' | 'fail' | 'unknown'; evidence: string; suggestion: string };

/** Landing-page conversion review from crawled evidence, not opinion. */
export function landingPageAudit(d: Db, projectId: string): Result<CroFinding[]> {
  const project = getProject(d, projectId);
  if (!project) return err(`no project ${projectId}`);
  const audit = d.get<{ id: string }>("SELECT id FROM site_audits WHERE project_id = ? AND status = 'complete' ORDER BY started_at DESC LIMIT 1", projectId);
  if (!audit) return err('conversion review needs crawl data; run an audit first');
  const home = d.get<Record<string, unknown>>(
    'SELECT * FROM audit_pages WHERE audit_id = ? ORDER BY depth, length(final_url) LIMIT 1', audit.id
  );
  if (!home) return err('no crawled pages on the latest audit');
  const brand = getBrand(d, projectId);
  const h1 = j.parse<string[]>(home.h1_json, []);
  const out: CroFinding[] = [];

  out.push({
    area: 'Value proposition above the fold',
    status: h1.length ? 'pass' : 'fail',
    evidence: h1.length ? `h1: "${h1[0]}"` : 'No h1 on the landing page.',
    suggestion: h1.length
      ? 'Check that the h1 says what the product does for the reader, not what it is called. A visitor should know in five seconds whether it is for them.'
      : 'Add an h1 that states the outcome a visitor gets.',
  });
  out.push({
    area: 'Mobile usability',
    status: home.viewport ? 'pass' : 'fail',
    evidence: home.viewport ? `viewport: ${home.viewport}` : 'No viewport meta tag.',
    suggestion: 'Most launch traffic is mobile. Without a viewport tag the page renders at desktop width.',
  });
  out.push({
    area: 'Loading performance',
    status: Number(home.elapsed_ms ?? 0) < 1200 ? 'pass' : Number(home.elapsed_ms ?? 0) < 3000 ? 'unknown' : 'fail',
    evidence: `Server response took ${home.elapsed_ms}ms for ${home.bytes} bytes of HTML. This is response time only, not a rendering measurement.`,
    suggestion: 'For real rendering metrics use Lighthouse locally, or Core Web Vitals field data from Search Console.',
  });
  out.push({
    area: 'Product screenshots',
    status: Number(home.images_total ?? 0) > 0 ? 'pass' : 'fail',
    evidence: `${home.images_total} image(s) on the landing page.`,
    suggestion: 'Show the product doing the thing. A landing page with no screenshot asks for trust it has not earned.',
  });
  out.push({
    area: 'Pricing clarity',
    status: brand?.pricingModel ? 'unknown' : 'fail',
    evidence: brand?.pricingModel ? `Brand profile records "${brand.pricingModel}", but LaunchOS cannot confirm it is visible on this page.` : 'No pricing recorded.',
    suggestion: 'State the price, or state plainly that it is free. "Contact us for pricing" loses self-serve buyers.',
  });
  out.push({
    area: 'Signup friction',
    status: 'unknown',
    evidence: 'LaunchOS does not attempt to sign up, so it cannot measure your funnel.',
    suggestion: 'Count the fields and the steps to first value yourself. Every required field costs completions.',
  });
  out.push({
    area: 'Trust signals',
    status: brand?.githubUrl ? 'pass' : 'unknown',
    evidence: brand?.githubUrl ? `Public repository: ${brand.githubUrl}` : 'No public repository or other checkable signal recorded.',
    suggestion: 'Use real signals: public source, published docs, named team, a working demo. Never fabricate logos, counts or testimonials.',
  });
  out.push({
    area: 'FAQ completeness',
    status: 'unknown',
    evidence: 'Checked at site level by the GEO audit rather than here.',
    suggestion: 'Answer the questions you actually get asked. Those answers do double duty for AI answer engines.',
  });
  return ok(out);
}
