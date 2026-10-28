#!/usr/bin/env node
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { flag, list, num, parseArgs, str } from './args';
import { bullet, c, emit, ExitSignal, fail, heading, kv, SEVERITY_COLOR, table } from './ui';
import * as core from '../core';
import { openDb, type Db } from '../core/db';

const HELP = `
${c.bold('launchos')} — free, open-source post-launch growth operating system

${c.bold('Setup')}
  launchos init                                     create the database and seed the registries
  launchos doctor                                   check the environment and report what is available

${c.bold('Projects')}
  launchos project add --name <n> [--url <u>] [--preset <p>] [--country IN]
  launchos project list | show | update | delete | export
  launchos brand show | set --field <f> --value <v> | verify --field <f> --how <source>
  launchos assets add --kind screenshot --label <l> --path <file> | assets list
  launchos domains list | add <host> | authorize <host> --note <how you control it>
  launchos domains verified <host> [--search-console] [--bing] [--indexnow-key <k>]

${c.bold('Audit')}
  launchos audit [--pages 40] [--depth 2] [--lighthouse]       crawl an authorized site
  launchos audit list | findings [--severity high] | pages | perf
  launchos seo tasks [--status open] | task done <id>

${c.bold('SEO')}
  launchos seo import <file.csv> --provider google_search_console
  launchos seo derive | keywords | cluster | map | strategy
  launchos seo add --keywords "a,b,c"

${c.bold('GEO / AEO')}
  launchos geo check | queries | schema | llms-txt | entity
  launchos geo observe --provider <p> --query <q> [--mentioned] [--cited] --evidence-kind url --evidence <ref>
  launchos geo history

${c.bold('Search engines')}
  launchos search-engines gsc | bing | checklist
  launchos indexnow <url> [<url>...]

${c.bold('Directories & listings')}
  launchos directories list [--category c] | match | verify | confirm <slug> [--free free] [--submission-url u]
  launchos listings prepare <slug> | list | instructions <slug>
  launchos listings approve <slug> --by <name> | submitted <slug> | evidence <submission-id> --live-url <u>

${c.bold('Launch & campaigns')}
  launchos launch prepare <playbook> | schedule <playbook> --date YYYY-MM-DD
  launchos campaign create --name <n> [--template new_saas_launch] | list

${c.bold('Content & social')}
  launchos content brief [--cluster <id>] [--topic <t>] | briefs | refresh
  launchos social generate --kind product_announcement [--platforms x,linkedin]
  launchos social list | approve <id> --by <name> | published <id> --evidence <url>
  launchos social card --title <t> [--subtitle s] [--out file.svg]

${c.bold('Growth')}
  launchos outreach add --org <o> --basis <how you have this contact> --type press_pitch --why <reason> --source <s>
  launchos outreach list | draft <prospect-id> --kind press
  launchos communities add --name <n> --kind <k> --rules "<their actual rules>"
  launchos backlinks add --source <u> --target <u> --origin editorial | verify | list | opportunities
  launchos referral create --name <n> --incentive <i> --disclosure <d>

${c.bold('Analytics')}
  launchos analytics import <file.csv> --provider <p> --dimension page|query|date
  launchos analytics dashboard | conversion --event signup --count 12
  launchos utm build --label <l> --url <u> --source <s> --medium <m> --campaign <c>
  launchos experiment create --hypothesis <h> --change <c> --metric <m>
  launchos experiment analyze <id> --a-n 400 --a-c 20 --b-n 410 --b-c 31
  launchos cro audit

${c.bold('Channels')}
  launchos aso prepare --store apple|google
  launchos local set --name <n> [--street s] [--city c] [--in-person] | checklist

${c.bold('Reporting')}
  launchos readiness | opportunities
  launchos report [--period weekly] [--format markdown|csv|json|pdf] [--out <file>]
  launchos tools [--category seo]

${c.bold('Global flags')}
  --project <id-or-slug>   select the project (defaults to the only one, or $LAUNCHOS_PROJECT)
  --json                   machine-readable output
  --db <path>              database path (default ./data/launchos.db or $LAUNCHOS_DB)
  --help                   this help
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { command, flags, positional } = parseArgs(argv);
  const json = flag(flags, 'json');

  if (!command.length || flag(flags, 'help') || command[0] === 'help') {
    console.log(HELP);
    return;
  }

  const dbPath = str(flags, 'db') ?? process.env.LAUNCHOS_DB ?? './data/launchos.db';
  const d = openDb(dbPath);
  try {
    await dispatch(d, command, flags, positional, json, dbPath);
  } finally {
    d.close();
  }
}

function pick(d: Db, flags: Record<string, string | boolean>): core.Project {
  const explicit = str(flags, 'project') ?? process.env.LAUNCHOS_PROJECT;
  if (explicit) {
    const p = core.getProject(d, explicit);
    if (!p) fail(`no project matched "${explicit}". Run: launchos project list`);
    return p!;
  }
  const all = core.listProjects(d);
  if (all.length === 1) return all[0];
  if (!all.length) fail('no projects yet. Create one: launchos project add --name "My product" --url https://example.com');
  fail(`several projects exist; pass --project <slug>. Available: ${all.map((p) => p.slug).join(', ')}`);
  throw new ExitSignal();
}

const unwrap = <T>(r: core.Result<T>): T => {
  if (!r.ok) fail(r.error, r.detail);
  return (r as core.Ok<T>).value;
};

async function dispatch(
  d: Db, command: string[], flags: Record<string, string | boolean>,
  positional: string[], json: boolean, dbPath: string
): Promise<void> {
  const [group, action, third] = command;
  const arg = third ?? positional[0];

  switch (group) {
    // ------------------------------------------------------------ setup
    case 'init': {
      const seeded = core.seedRegistry(d);
      core.ensureWorkspace(d);
      emit(json, { database: d.path, ...seeded }, () => {
        heading('LaunchOS initialised');
        kv('database', d.path);
        kv('directories seeded', seeded.directories);
        kv('free tools seeded', seeded.tools);
        console.log('');
        bullet('Next: launchos project add --name "My product" --url https://yoursite.com');
        bullet(`The registry is seed data: run ${c.cyan('launchos directories verify')} to check the URLs are live.`);
      });
      return;
    }

    case 'doctor': {
      const checks = await doctor(d);
      emit(json, checks, () => {
        heading('Environment');
        for (const ch of checks) {
          const col = SEVERITY_COLOR[ch.status] ?? ((s: string) => s);
          console.log(`  ${col(ch.status.padEnd(8))} ${ch.name}`);
          if (ch.detail) console.log(`           ${c.grey(ch.detail)}`);
        }
      });
      return;
    }

    // ------------------------------------------------------------ projects
    case 'project': {
      if (action === 'add') {
        const res = await core.createProject(d, {
          name: str(flags, 'name') ?? fail('--name is required'),
          websiteUrl: str(flags, 'url'),
          preset: str(flags, 'preset') as core.PresetId | undefined,
          category: str(flags, 'category'),
          country: str(flags, 'country'),
          market: str(flags, 'market'),
          owner: str(flags, 'owner'),
          objectives: str(flags, 'objectives'),
          launchStatus: str(flags, 'status') as core.Project['launchStatus'] | undefined,
        });
        const p = unwrap(res);
        emit(json, p, () => {
          heading(`Project created: ${p.name}`);
          kv('slug', p.slug);
          kv('preset', `${p.preset} — ${core.presetOf(p.preset).label}`);
          kv('website', p.websiteUrl ?? 'not set');
          console.log('');
          if (p.websiteUrl) {
            bullet(`Audits require explicit authorization of the host you control:`);
            console.log(`    ${c.cyan(`launchos domains authorize ${new URL(p.websiteUrl).host} --project ${p.slug} --note "I own this domain"`)}`);
          }
          bullet(`Then fill in the brand profile: ${c.cyan(`launchos brand set --project ${p.slug} --field tagline --value "..."`)}`);
        });
        return;
      }
      if (action === 'list' || !action) {
        const ps = core.listProjects(d);
        emit(json, ps, () => {
          heading(`Projects (${ps.length})`);
          table(ps.map((p) => ({ slug: p.slug, name: p.name, preset: p.preset, status: p.launchStatus, website: p.websiteUrl ?? '—' })));
        });
        return;
      }
      if (action === 'show') {
        const p = pick(d, flags);
        const brand = core.getBrand(d, p.id);
        const completeness = core.brandCompleteness(d, p.id);
        const domains = core.listDomains(d, p.id);
        emit(json, { project: p, brand, completeness, domains }, () => {
          heading(p.name);
          kv('slug', p.slug); kv('preset', p.preset); kv('website', p.websiteUrl ?? '—');
          kv('country / market', [p.country, p.market].filter(Boolean).join(' / ') || '—');
          kv('launch status', p.launchStatus);
          kv('brand completeness', `${completeness.score}% (${completeness.missing.length} missing, ${completeness.unverified.length} unverified)`);
          heading('Domains');
          table(domains.map((x) => ({ host: x.host, authorized: x.authorized ? 'yes' : c.red('no'), gsc: x.verifiedSearchConsole ? 'yes' : '—', bing: x.verifiedBing ? 'yes' : '—' })));
        });
        return;
      }
      if (action === 'update') {
        const p = pick(d, flags);
        const patch: Record<string, unknown> = {};
        for (const k of ['name', 'preset', 'category', 'country', 'market', 'owner', 'objectives']) {
          const v = str(flags, k);
          if (v !== undefined) patch[k] = v;
        }
        const url = str(flags, 'url'); if (url) patch.websiteUrl = url;
        const status = str(flags, 'status'); if (status) patch.launchStatus = status;
        const updated = unwrap(core.updateProject(d, p.id, patch));
        emit(json, updated, () => { heading('Updated'); kv('project', updated.name); });
        return;
      }
      if (action === 'delete') {
        const p = pick(d, flags);
        if (!flag(flags, 'yes')) fail(`this permanently deletes "${p.name}" and every row belonging to it. Re-run with --yes to confirm.`);
        unwrap(core.deleteProject(d, p.id));
        emit(json, { deleted: p.slug }, () => console.log(`Deleted ${p.slug}.`));
        return;
      }
      if (action === 'export') {
        const p = pick(d, flags);
        const data = core.exportProject(d, p.id);
        const out = str(flags, 'out');
        const body = JSON.stringify(data, null, 2);
        if (out) { writeOut(out, body); console.log(`Wrote ${out}`); }
        else console.log(body);
        return;
      }
      fail(`unknown project action "${action}"`);
      return;
    }

    case 'assets': {
      const p = pick(d, flags);
      if (action === 'add') {
        const r = unwrap(core.addAsset(d, p.id, {
          kind: str(flags, 'kind') ?? fail(`--kind is required. Allowed: ${core.ASSET_KINDS.join(', ')}`),
          label: str(flags, 'label') ?? fail('--label is required'),
          pathOrUrl: str(flags, 'path') ?? str(flags, 'url') ?? fail('--path <file> or --url <url> is required'),
        }));
        emit(json, r, () => { heading('Asset recorded'); kv('kind', r.kind); kv('label', r.label); kv('location', r.pathOrUrl); });
        return;
      }
      const as = core.listAssets(d, p.id, str(flags, 'kind'));
      emit(json, as, () => { heading(`Assets — ${as.length}`); table(as.map((a) => ({ kind: a.kind, label: a.label, location: a.pathOrUrl ?? '' }))); });
      return;
    }

    case 'brand': {
      const p = pick(d, flags);
      if (action === 'show' || !action) {
        const brand = core.getBrand(d, p.id);
        const comp = core.brandCompleteness(d, p.id);
        emit(json, { brand, completeness: comp }, () => {
          heading(`Brand profile — ${p.name}`);
          if (!brand) return console.log('  none');
          for (const [k, v] of Object.entries(brand)) {
            if (['id', 'projectId', 'verifiedFields'].includes(k)) continue;
            const verified = brand.verifiedFields[k] ? c.green(' ✓verified') : '';
            kv(k, `${Array.isArray(v) ? v.join(', ') : v ?? ''}${verified}`);
          }
          heading('Completeness');
          kv('score', `${comp.score}%`);
          if (comp.missing.length) kv('missing', c.red(comp.missing.join(', ')));
          if (comp.unverified.length) kv('unverified', c.yellow(comp.unverified.join(', ')));
        });
        return;
      }
      if (action === 'set') {
        const field = str(flags, 'field') ?? fail('--field is required');
        const raw = str(flags, 'value') ?? fail('--value is required');
        const arrayFields = ['features', 'languages', 'brandColors'];
        const value: unknown = arrayFields.includes(field!) ? raw!.split(/\s*[,|]\s*/).filter(Boolean)
          : field === 'contactPublic' ? raw === 'true' || raw === '1'
          : field === 'social' ? JSON.parse(raw!)
          : raw;
        const res = unwrap(core.updateBrand(d, p.id, { [field!]: value } as core.BrandPatch));
        const prop = core.propagateBrandChange(d, p.id, res.changes.map((x) => x.field));
        emit(json, { changes: res.changes, propagation: prop }, () => {
          heading('Brand updated');
          for (const ch of res.changes) kv(ch.field, `${JSON.stringify(ch.before)} → ${JSON.stringify(ch.after)}`);
          kv('brand revision', res.brand.revision);
          if (prop.flagged.length) {
            heading('Listings flagged for update');
            for (const f of prop.flagged) bullet(`${f.directorySlug} → ${f.status}`);
            console.log(c.grey(`  ${prop.tasks} task(s) created. LaunchOS never rewrites a published listing for you.`));
          }
        });
        return;
      }
      if (action === 'verify') {
        const field = str(flags, 'field') ?? fail('--field is required');
        const how = str(flags, 'how') ?? fail('--how is required: state how you verified this field');
        const brand = core.getBrand(d, p.id)!;
        const res = unwrap(core.updateBrand(d, p.id, { verifiedFields: { ...brand.verifiedFields, [field!]: how! } }));
        emit(json, res.brand.verifiedFields, () => { heading('Verified'); kv(field!, how!); });
        return;
      }
      fail(`unknown brand action "${action}"`);
      return;
    }

    case 'domains': {
      const p = pick(d, flags);
      if (action === 'list' || !action) {
        const ds = core.listDomains(d, p.id);
        emit(json, ds, () => { heading(`Domains — ${p.name}`); table(ds.map((x) => ({ host: x.host, authorized: x.authorized ? 'yes' : 'NO', note: x.authorizationNote ?? '', gsc: x.verifiedSearchConsole ? 'yes' : '—', bing: x.verifiedBing ? 'yes' : '—' }))); });
        return;
      }
      if (action === 'add') {
        const host = arg ?? fail('pass the host, e.g. launchos domains add example.com');
        const res = unwrap(await core.addDomain(d, p.id, host!));
        emit(json, res, () => { heading('Domain registered'); kv('host', res.host); bullet(`Authorize it before auditing: ${c.cyan(`launchos domains authorize ${res.host} --note "..."`)}`); });
        return;
      }
      if (action === 'authorize') {
        const host = arg ?? fail('pass the host');
        const note = str(flags, 'note') ?? fail('--note is required: state how you control this domain');
        const by = str(flags, 'by') ?? process.env.USER ?? 'operator';
        const res = unwrap(core.authorizeDomain(d, p.id, host!, note!, by));
        emit(json, res, () => { heading('Authorized'); kv('host', res.host); kv('note', res.authorizationNote); });
        return;
      }
      if (action === 'verified') {
        const host = arg ?? fail('pass the host');
        const res = unwrap(core.setDomainVerification(d, p.id, host!, {
          searchConsole: flag(flags, 'search-console') ? true : undefined,
          bing: flag(flags, 'bing') ? true : undefined,
          indexnowKey: str(flags, 'indexnow-key'),
        }));
        emit(json, res, () => { heading('Verification recorded'); kv('host', res.host); kv('search console', res.verifiedSearchConsole); kv('bing', res.verifiedBing); kv('indexnow key', res.indexnowKey ? 'set' : '—'); });
        return;
      }
      fail(`unknown domains action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ audit
    case 'audit': {
      const p = pick(d, flags);
      if (!action || action === 'run') {
        const res = unwrap(await core.runProjectAudit(d, p.id, {
          maxPages: num(flags, 'pages'), maxDepth: num(flags, 'depth'),
          sitemapUrl: str(flags, 'sitemap'), runLighthouse: flag(flags, 'lighthouse'),
          onProgress: json ? undefined : (m) => console.log(c.grey(`  … ${m}`)),
        }));
        const a = res.result;
        emit(json, { auditId: res.auditId, pages: a.pages.length, findings: a.findings.length, tasksCreated: res.tasksCreated, skipped: a.skipped, framework: a.framework }, () => {
          heading(`Audit complete — ${p.name}`);
          kv('audit id', res.auditId);
          kv('pages crawled', `${a.pages.length} of ${a.requestedPages} requested`);
          kv('framework detected', a.framework);
          kv('sitemap URLs', a.sitemapUrls.length);
          kv('link discovery', a.linkDiscovery ? 'enabled' : c.yellow('disabled (robots.txt unreachable)'));
          kv('findings', a.findings.length);
          kv('SEO tasks created', res.tasksCreated);
          if (a.skipped.length) { heading('Skipped'); for (const s of a.skipped.slice(0, 8)) bullet(`${s.url} — ${s.reason}`); }
          heading('Findings by severity');
          const counts = new Map<string, number>();
          for (const f of a.findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
          for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
            if (counts.get(sev)) console.log(`  ${(SEVERITY_COLOR[sev] ?? ((s: string) => s))(sev.padEnd(9))} ${counts.get(sev)}`);
          }
          console.log('');
          bullet(`Full list: ${c.cyan(`launchos audit findings --project ${p.slug}`)}`);
        });
        return;
      }
      if (action === 'list') {
        const as = core.listAudits(d, p.id);
        emit(json, as, () => { heading(`Audits — ${p.name}`); table(as.map((a) => ({ id: a.id, status: a.status, pages: a.pagesCrawled, started: a.startedAt.slice(0, 16).replace('T', ' '), error: a.error ?? '' }))); });
        return;
      }
      if (action === 'findings') {
        const a = core.latestAudit(d, p.id);
        if (!a) fail('no completed audit; run: launchos audit');
        let fs = core.listFindings(d, a!.id);
        const sev = str(flags, 'severity');
        if (sev) fs = fs.filter((f) => f.severity === sev);
        fs = core.sortFindings(fs) as typeof fs;
        emit(json, fs, () => {
          heading(`Findings — audit ${a!.id} (${fs.length})`);
          for (const f of fs) {
            const col = SEVERITY_COLOR[f.severity] ?? ((s: string) => s);
            console.log('');
            console.log(`  ${col(`[${f.severity}]`)} ${c.bold(f.title)}  ${c.grey(f.checkId)}`);
            if (f.pageUrl) console.log(`     ${c.grey('page')}       ${f.pageUrl}`);
            console.log(`     ${c.grey('evidence')}   ${f.evidence.split('\n').join('\n                ')}`);
            console.log(`     ${c.grey('impact')}     ${f.impactHypothesis}`);
            console.log(`     ${c.grey('fix')}        ${f.suggestion}`);
            console.log(`     ${c.grey('verify')}     ${f.verification}`);
            if (f.docsUrl) console.log(`     ${c.grey('docs')}       ${f.docsUrl}`);
            if (f.fixSnippet) console.log(`     ${c.grey(`${f.fixLanguage ?? 'code'}:`)}\n${f.fixSnippet.split('\n').map((l) => `       ${c.cyan(l)}`).join('\n')}`);
          }
        });
        return;
      }
      if (action === 'pages') {
        const a = core.latestAudit(d, p.id);
        if (!a) fail('no completed audit');
        const pages = core.auditPages(d, a!.id);
        emit(json, pages, () => {
          heading(`Crawled pages — ${pages.length}`);
          table(pages.map((x) => ({ url: String(x.final_url), status: String(x.status_code), words: String(x.word_count), title: String(x.title ?? '') })));
        });
        return;
      }
      if (action === 'perf') {
        const a = core.latestAudit(d, p.id);
        if (!a) fail('no completed audit');
        const perf = core.performanceResults(d, a!.id);
        emit(json, perf, () => {
          heading('Performance measurements');
          for (const r of perf) {
            console.log('');
            kv('url', r.url); kv('source', r.source); kv('measurement kind', r.measurementKind);
            for (const [k, v] of Object.entries(r.metrics)) kv(`  ${k}`, v);
            console.log(c.grey(`  ${r.note}`));
          }
        });
        return;
      }
      fail(`unknown audit action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ seo
    case 'seo': {
      const p = pick(d, flags);
      if (action === 'import') {
        const file = arg ?? fail('pass a CSV path');
        const csv = readFileSync(resolve(file!), 'utf8');
        const res = unwrap(core.importSearchPerformance(d, p.id, csv, {
          provider: (str(flags, 'provider') ?? 'other') as 'google_search_console' | 'bing_webmaster' | 'other',
          filename: file,
        }));
        emit(json, res, () => { heading('Search performance imported'); kv('rows imported', res.imported); kv('rows skipped', res.skipped); kv('columns detected', res.columns.join(', ')); });
        return;
      }
      if (action === 'derive') {
        const res = unwrap(core.deriveKeywordsFromSite(d, p.id));
        emit(json, res, () => { heading('Keywords derived'); kv('added', res.added); kv('from', res.from); console.log(c.grey('  These are labelled qualitative hypotheses: no search volume is available from a free, reliable source.')); });
        return;
      }
      if (action === 'add') {
        const kws = list(flags, 'keywords');
        if (!kws.length) fail('--keywords "a,b,c" is required');
        const res = unwrap(core.addKeywordHypotheses(d, p.id, kws));
        emit(json, res, () => { heading('Keyword hypotheses added'); kv('added', res.added); });
        return;
      }
      if (action === 'keywords') {
        const kws = core.listKeywords(d, p.id);
        emit(json, kws, () => {
          heading(`Keywords — ${kws.length}`);
          table(kws.slice(0, 60).map((k) => ({ keyword: k.keyword, intent: k.intent, confidence: k.dataConfidence, impressions: k.impressions ?? '—', clicks: k.clicks ?? '—', position: k.position ?? '—' })));
          console.log(c.grey('\n  "qualitative_hypothesis" means no measured demand data. LaunchOS never invents volume, difficulty or CPC.'));
        });
        return;
      }
      if (action === 'cluster') {
        const cs = unwrap(core.buildClusters(d, p.id, num(flags, 'threshold')));
        emit(json, cs, () => {
          heading(`Clusters — ${cs.length}`);
          for (const cl of cs) {
            console.log('');
            console.log(`  ${c.bold(cl.label)} ${c.grey(`(${cl.intent} → ${cl.targetPageType})`)}`);
            console.log(`     ${c.grey(cl.rationale)}`);
            console.log(`     ${cl.keywords.slice(0, 8).join(', ')}${cl.keywords.length > 8 ? ` … +${cl.keywords.length - 8}` : ''}`);
          }
        });
        return;
      }
      if (action === 'map') {
        const rows = unwrap(core.buildContentMap(d, p.id));
        emit(json, rows, () => {
          heading('Content map');
          for (const r of rows) {
            console.log('');
            console.log(`  ${c.bold(r.cluster.label)} ${r.action === 'create_new' ? c.yellow('[create new]') : c.green('[optimize existing]')}`);
            if (r.existingUrl) console.log(`     ${r.existingUrl}`);
            console.log(`     ${c.grey(r.reason)}`);
          }
        });
        return;
      }
      if (action === 'strategy') {
        const s = unwrap(core.seoStrategy(d, p.id));
        emit(json, s, () => {
          heading(`SEO strategy — ${s.project}`);
          kv('preset', s.preset); kv('audience', s.audience); kv('intent focus', s.searchIntentFocus.join(', '));
          heading('Topics'); table(s.topics.map((t) => ({ topic: t.label, intent: t.intent, keywords: t.keywords, page: t.pageType, action: t.action })));
          if (s.technicalFixes.length) { heading('Blocking technical fixes'); for (const f of s.technicalFixes) bullet(`[${f.severity}] ${f.title}${f.pageUrl ? ` — ${f.pageUrl}` : ''}`); }
          heading('Internal linking'); for (const l of s.internalLinking) bullet(l);
          heading('Next actions'); s.nextActions.forEach((a2, i) => console.log(`  ${i + 1}. ${a2}`));
          heading('Data caveats'); for (const cv of s.dataCaveats) console.log(`  ${c.yellow('!')} ${cv}`);
        });
        return;
      }
      if (action === 'tasks') {
        const ts = core.listSeoTasks(d, p.id, str(flags, 'status'));
        emit(json, ts, () => { heading(`SEO tasks — ${ts.length}`); table(ts.map((t) => ({ id: String(t.id), severity: String(t.severity), status: String(t.status), area: String(t.area), title: String(t.title) }))); });
        return;
      }
      if (action === 'task') {
        const id = arg ?? fail('pass a task id');
        unwrap(core.setSeoTaskStatus(d, id!, (str(flags, 'status') ?? 'done') as 'done'));
        console.log('Updated.');
        return;
      }
      fail(`unknown seo action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ geo
    case 'geo': {
      const p = pick(d, flags);
      if (action === 'check' || !action) {
        const g = unwrap(core.geoAudit(d, p.id));
        emit(json, g, () => {
          heading(`GEO / AEO audit — ${g.project}`);
          kv('pages examined', g.pagesExamined);
          kv('result', `${c.green(`${g.score.passed} pass`)}, ${c.red(`${g.score.failed} fail`)}, ${c.yellow(`${g.score.unknown} unknown`)} of ${g.score.total}`);
          for (const ch of g.checks) {
            console.log('');
            const col = SEVERITY_COLOR[ch.status] ?? ((s: string) => s);
            console.log(`  ${col(ch.status.padEnd(8))} ${c.bold(ch.requirement)}`);
            console.log(`           ${c.grey('evidence')} ${ch.evidence}`);
            console.log(`           ${c.grey('why')}      ${ch.why}`);
            console.log(`           ${c.grey('fix')}      ${ch.fix}`);
          }
          console.log('');
          console.log(c.yellow(`  ! ${g.caveat}`));
        });
        return;
      }
      if (action === 'queries') {
        const qs = unwrap(core.generateAiQueries(d, p.id));
        emit(json, qs, () => {
          heading(`AI search query library — ${qs.length}`);
          for (const q of qs) { console.log(''); console.log(`  ${c.bold(q.query)} ${c.grey(`(${q.intent})`)}`); console.log(`     ${c.grey(q.rationale)}`); }
          console.log('');
          console.log(c.grey('  Run these yourself in each assistant and record what you see with "launchos geo observe".'));
          console.log(c.grey('  LaunchOS does not query AI providers: that needs a paid key, and one sampled answer is not reproducible.'));
        });
        return;
      }
      if (action === 'schema') {
        const s = unwrap(core.generateSchema(d, p.id));
        const out = str(flags, 'out');
        if (out) { writeOut(out, s.jsonLd); console.log(`Wrote ${out}`); }
        emit(json, s, () => {
          heading('Structured data (JSON-LD)');
          kv('types', s.types.join(', '));
          console.log('');
          console.log(s.jsonLd.split('\n').map((l) => `  ${l}`).join('\n'));
          heading('Deliberately omitted');
          for (const o of s.omitted) bullet(o);
        });
        return;
      }
      if (action === 'llms-txt') {
        const r = unwrap(core.generateLlmsTxt(d, p.id));
        const out = str(flags, 'out');
        if (out) { writeOut(out, r.content); console.log(`Wrote ${out}`); }
        emit(json, r, () => {
          heading('llms.txt');
          console.log(r.content.split('\n').map((l) => `  ${l}`).join('\n'));
          console.log('');
          console.log(c.yellow(`  ! ${r.disclaimer}`));
        });
        return;
      }
      if (action === 'entity') {
        const rows = unwrap(await core.checkEntityConsistency(d, p.id));
        emit(json, rows, () => {
          heading('Brand entity consistency');
          table(rows.map((r) => ({ field: r.field, source: r.source, status: r.status, observed: (r.observed ?? '').slice(0, 60) })));
        });
        return;
      }
      if (action === 'observe') {
        const res = unwrap(core.recordVisibility(d, p.id, {
          provider: str(flags, 'provider') ?? fail('--provider is required'),
          query: str(flags, 'query') ?? fail('--query is required'),
          brandMentioned: flag(flags, 'mentioned'),
          cited: flag(flags, 'cited'),
          citationUrls: list(flags, 'citations'),
          evidenceKind: (str(flags, 'evidence-kind') ?? 'note') as 'note',
          evidenceRef: str(flags, 'evidence'),
          observedOn: str(flags, 'date'),
          notes: str(flags, 'notes'),
          recordedBy: str(flags, 'by') ?? process.env.USER ?? 'operator',
        }));
        emit(json, res, () => { heading('Observation recorded'); kv('id', res.id); console.log(c.yellow(`  ! ${res.caveat}`)); });
        return;
      }
      if (action === 'history') {
        const rows = core.visibilityHistory(d, p.id);
        emit(json, rows, () => {
          heading(`AI visibility observations — ${rows.length}`);
          table(rows.map((r) => ({ date: String(r.observed_on), provider: String(r.provider), query: String(r.query_text).slice(0, 40), mentioned: r.brand_mentioned ? 'yes' : 'no', cited: r.cited ? 'yes' : 'no', evidence: String(r.evidence_kind) })));
        });
        return;
      }
      fail(`unknown geo action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ search engines
    case 'search-engines': {
      const p = pick(d, flags);
      const which = action ?? 'checklist';
      if (which === 'gsc') {
        const s = unwrap(core.searchConsoleSetup(d, p.id));
        emit(json, s, () => renderSteps(s.provider, s.steps, s.notes));
        return;
      }
      if (which === 'bing') {
        const s = unwrap(core.bingSetup(d, p.id));
        emit(json, s, () => renderSteps(s.provider, s.steps, s.notes));
        return;
      }
      const steps = unwrap(core.discoveryChecklist(d, p.id));
      emit(json, steps, () => renderSteps('Website discovery checklist', steps, []));
      return;
    }

    case 'indexnow': {
      const p = pick(d, flags);
      const urls = [arg, ...positional].filter((x): x is string => !!x);
      if (!urls.length) fail('pass at least one URL');
      const res = unwrap(await core.submitIndexNow(d, p.id, urls));
      emit(json, res, () => {
        heading('IndexNow submission');
        kv('endpoint status', res.status); kv('URLs submitted', res.submitted); kv('accepted', res.accepted);
        console.log('');
        console.log(c.yellow(`  ! ${res.meaning}`));
      });
      return;
    }

    // ------------------------------------------------------------ directories
    case 'directories': {
      if (action === 'list' || !action) {
        const ds = core.listDirectories(d, { category: str(flags, 'category'), preset: str(flags, 'preset') });
        emit(json, ds, () => {
          heading(`Directory registry — ${ds.length}`);
          table(ds.map((x) => ({ slug: x.slug, name: x.name, category: x.category, free: x.freeSubmission, geo: x.geography, verified: x.verificationStatus, last: x.lastVerified ?? '—' })));
          console.log(c.grey('\n  "unverified" = seed data not yet checked. Run "launchos directories verify" for live URL checks,'));
          console.log(c.grey('  and "launchos directories confirm <slug>" once you have checked the real submission path yourself.'));
        });
        return;
      }
      if (action === 'match') {
        const p = pick(d, flags);
        const ms = unwrap(core.matchDirectories(d, p.id));
        const eligible = ms.filter((m) => m.eligible === 'eligible');
        emit(json, ms, () => {
          heading(`Directory matching — ${p.name}`);
          kv('evaluated', ms.length);
          kv('eligible', eligible.length);
          kv('needs check', ms.filter((m) => m.eligible === 'needs_check').length);
          kv('not eligible', ms.filter((m) => m.eligible === 'not_eligible').length);
          kv('paid only', ms.filter((m) => m.eligible === 'paid_only').length);
          heading('Top matches');
          for (const m of ms.slice(0, 12)) {
            const col = m.eligible === 'eligible' ? c.green : m.eligible === 'needs_check' ? c.yellow : c.grey;
            console.log('');
            console.log(`  ${col(m.eligible.padEnd(12))} ${c.bold(m.directory.name)} ${c.grey(`${m.relevance}/100 · ${m.directory.category}`)}`);
            for (const r of m.reasons.slice(0, 2)) console.log(`     ${c.green('+')} ${r}`);
            for (const b of m.blockers.slice(0, 3)) console.log(`     ${c.red('-')} ${b}`);
          }
        });
        return;
      }
      if (action === 'verify') {
        const res = await core.verifyDirectories(d, { limit: num(flags, 'limit'), onProgress: json ? undefined : (m) => console.log(c.grey(`  … ${m}`)) });
        emit(json, res, () => {
          heading('Registry URL verification');
          kv('checked', res.checked); kv('reachable', res.reachable); kv('unreachable', res.unreachable.length);
          if (res.unreachable.length) { heading('Unreachable'); for (const u of res.unreachable) bullet(`${u.slug}: ${u.url} — ${u.detail}`); }
          console.log('');
          console.log(c.yellow('  ! Reachability is not the same as confirming free submission. That still needs a human:'));
          console.log(c.grey('    launchos directories confirm <slug> --free free --submission-url <url>'));
        });
        return;
      }
      if (action === 'confirm') {
        const slug = arg ?? fail('pass a directory slug');
        const res = unwrap(core.confirmDirectory(d, slug!, {
          freeSubmission: str(flags, 'free') as 'free' | undefined,
          submissionUrl: str(flags, 'submission-url'),
          notes: str(flags, 'notes'),
          by: str(flags, 'by') ?? process.env.USER ?? 'operator',
        }));
        emit(json, res, () => { heading('Confirmed'); kv('slug', res.slug); kv('free submission', res.freeSubmission); kv('submission url', res.submissionUrl ?? '—'); });
        return;
      }
      fail(`unknown directories action "${action}"`);
      return;
    }

    case 'listings': {
      const p = pick(d, flags);
      if (action === 'prepare') {
        const slug = arg ?? fail('pass a directory slug');
        const draft = unwrap(core.prepareListing(d, p.id, slug!));
        emit(json, draft, () => {
          heading(`Listing prepared — ${draft.directoryName}`);
          kv('status', draft.status);
          heading('Fields');
          for (const [k, v] of Object.entries(draft.fields)) console.log(`  ${c.grey(k.padEnd(20))} ${c.grey(`(${v.length})`)} ${v.split('\n').join('\n' + ' '.repeat(28))}`);
          if (draft.warnings.length) { heading('Warnings'); for (const w of draft.warnings) console.log(`  ${c.yellow('!')} ${w}`); }
          heading('Assets'); for (const a of draft.assetChecklist) bullet(a);
        });
        return;
      }
      if (action === 'list' || !action) {
        const ls = core.listListings(d, p.id);
        emit(json, ls, () => { heading(`Listings — ${p.name}`); table(ls.map((l) => ({ directory: l.directoryName, slug: l.directorySlug, status: l.status, warnings: l.warnings.length, approved: l.approvedBy ?? '—' }))); });
        return;
      }
      if (action === 'instructions') {
        const slug = arg ?? fail('pass a directory slug');
        const r = unwrap(core.submissionInstructions(d, p.id, slug!));
        emit(json, r, () => {
          heading(`Submission instructions — ${r.directory.name}`);
          r.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
        });
        return;
      }
      if (action === 'approve') {
        const slug = arg ?? fail('pass a directory slug');
        const by = str(flags, 'by') ?? fail('--by <your name> is required: approval must be attributable');
        const r = unwrap(core.approveListing(d, p.id, slug!, by!));
        emit(json, r, () => { heading('Approved'); kv('directory', r.directoryName); kv('status', r.status); kv('approved by', r.approvedBy); });
        return;
      }
      if (action === 'submitted') {
        const slug = arg ?? fail('pass a directory slug');
        const r = unwrap(core.recordSubmission(d, p.id, slug!, { method: 'manual', submittedAt: str(flags, 'date'), note: str(flags, 'note') }));
        emit(json, r, () => { heading('Submission recorded'); kv('submission id', r.submissionId); bullet(`Attach evidence when it goes live: ${c.cyan(`launchos listings evidence ${r.submissionId} --live-url <url>`)}`); });
        return;
      }
      if (action === 'evidence') {
        const id = arg ?? fail('pass a submission id');
        const liveUrl = str(flags, 'live-url');
        const r = unwrap(await core.recordEvidence(d, id!, {
          kind: liveUrl ? 'live_url' : (str(flags, 'kind') ?? 'note') as 'note',
          reference: liveUrl ?? str(flags, 'ref') ?? fail('--live-url or --ref is required'),
          observedOn: str(flags, 'date'),
        }));
        emit(json, r, () => {
          heading('Evidence recorded');
          kv('verified', r.verified ? c.green('yes') : c.yellow('no'));
          kv('listing status', r.status);
          console.log(`  ${c.grey(r.detail)}`);
        });
        return;
      }
      fail(`unknown listings action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ launch / campaigns
    case 'launch': {
      const p = pick(d, flags);
      if (action === 'prepare') {
        const id = arg ?? fail('pass a playbook id, e.g. product_hunt');
        const pb = unwrap(core.buildPlaybook(d, p.id, id!));
        emit(json, pb, () => {
          heading(`${pb.name}`);
          kv('destination', pb.destination);
          heading('Policy'); for (const n of pb.policyNotes) console.log(`  ${c.yellow('!')} ${n}`);
          heading('Readiness');
          for (const r of pb.readiness) {
            const col = SEVERITY_COLOR[r.status] ?? ((s: string) => s);
            console.log(`  ${col(r.status.padEnd(8))} ${r.label}`);
            console.log(`           ${c.grey(r.detail)}`);
          }
          if (Object.keys(pb.copy).length) { heading('Prepared copy'); for (const [k, v] of Object.entries(pb.copy)) { console.log(`\n  ${c.bold(k)}:`); console.log(v.split('\n').map((l) => `    ${l}`).join('\n')); } }
          heading('Assets'); for (const a of pb.assets) bullet(a);
          heading('Schedule');
          for (const s of pb.schedule) { console.log(`\n  ${c.bold(s.phase)} ${c.grey(`(${s.whenRelativeToLaunch} days)`)}`); for (const t of s.tasks) bullet(t, 4); }
          console.log('');
          console.log(c.grey(`  Boundary: ${pb.automationBoundary}`));
        });
        return;
      }
      if (action === 'schedule') {
        const id = arg ?? fail('pass a playbook id');
        const date = str(flags, 'date') ?? fail('--date YYYY-MM-DD is required');
        const r = unwrap(core.scheduleLaunch(d, p.id, id!, date!));
        emit(json, r, () => { heading('Launch scheduled'); kv('tasks created', r.created); });
        return;
      }
      fail(`unknown launch action "${action}"`);
      return;
    }

    case 'campaign': {
      const p = pick(d, flags);
      if (action === 'create') {
        const r = unwrap(core.createCampaign(d, p.id, {
          name: str(flags, 'name') ?? fail('--name is required'),
          template: str(flags, 'template'), objective: str(flags, 'objective'),
          audience: str(flags, 'audience'), region: str(flags, 'region'),
          startsOn: str(flags, 'start'), endsOn: str(flags, 'end'), channels: list(flags, 'channels'),
        }));
        emit(json, r, () => {
          heading(`Campaign created — ${r.name}`);
          kv('id', r.id); kv('objective', r.objective); kv('channels', r.channels.join(', ') || '—');
          if (r.plannedContent.length) { heading('Planned content'); for (const x of r.plannedContent) bullet(x); }
        });
        return;
      }
      if (action === 'list' || !action) {
        const cs = core.listCampaigns(d, p.id);
        emit(json, cs, () => { heading(`Campaigns — ${cs.length}`); table(cs.map((x) => ({ id: String(x.id), name: String(x.name), status: String(x.status), objective: String(x.objective).slice(0, 48) }))); });
        return;
      }
      if (action === 'templates') {
        emit(json, core.CAMPAIGN_TEMPLATES, () => {
          heading('Campaign templates');
          for (const [k, v] of Object.entries(core.CAMPAIGN_TEMPLATES)) { console.log(`\n  ${c.bold(k)}`); console.log(`     ${v.objective}`); console.log(`     ${c.grey(v.channels.join(', '))}`); }
        });
        return;
      }
      fail(`unknown campaign action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ content / social
    case 'content': {
      const p = pick(d, flags);
      if (action === 'brief') {
        const b = unwrap(core.createBrief(d, p.id, { clusterId: str(flags, 'cluster'), topic: str(flags, 'topic'), contentType: str(flags, 'type') }));
        const md = core.briefToMarkdown(b);
        const out = str(flags, 'out');
        if (out) { writeOut(out, md); console.log(`Wrote ${out}`); }
        emit(json, b, () => console.log(md.split('\n').map((l) => `  ${l}`).join('\n')));
        return;
      }
      if (action === 'briefs' || !action) {
        const bs = core.listBriefs(d, p.id);
        emit(json, bs, () => { heading(`Content briefs — ${bs.length}`); table(bs.map((b) => ({ id: b.id, title: b.workingTitle, type: b.contentType, intent: b.searchIntent, status: b.status }))); });
        return;
      }
      if (action === 'refresh') {
        const rs = unwrap(core.contentRefresh(d, p.id));
        emit(json, rs, () => {
          heading(`Content refresh candidates — ${rs.length}`);
          for (const r of rs.slice(0, 20)) { console.log(''); console.log(`  ${(SEVERITY_COLOR[r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'medium' : 'low'])(`[${r.priority}]`)} ${r.url}`); for (const i of r.issues) bullet(i, 5); }
        });
        return;
      }
      fail(`unknown content action "${action}"`);
      return;
    }

    case 'social': {
      const p = pick(d, flags);
      if (action === 'generate') {
        const ds = unwrap(core.generateSocialDrafts(d, p.id, {
          kind: (str(flags, 'kind') ?? 'product_announcement') as core.DraftKind,
          platforms: list(flags, 'platforms'), campaignId: str(flags, 'campaign'), detail: str(flags, 'detail'),
        }));
        emit(json, ds, () => {
          heading(`Social drafts — ${ds.length}`);
          for (const s of ds) {
            console.log('');
            console.log(`  ${c.bold(core.PLATFORMS[s.platform].label)} ${c.grey(`${s.format} · ${s.charCount}${s.charLimit ? `/${s.charLimit}` : ''} chars · ${s.id}`)}`);
            console.log(s.body.split('\n').map((l) => `    ${l}`).join('\n'));
            for (const w of s.warnings) console.log(`    ${c.yellow('!')} ${w}`);
            console.log(`    ${c.grey(`media: ${s.mediaRequirements.join(' | ')}`)}`);
          }
        });
        return;
      }
      if (action === 'list' || !action) {
        const ds = core.listSocialDrafts(d, p.id);
        emit(json, ds, () => { heading(`Social drafts — ${ds.length}`); table(ds.map((s) => ({ id: s.id, platform: s.platform, status: s.status, chars: `${s.charCount}${s.charLimit ? `/${s.charLimit}` : ''}`, warnings: s.warnings.length }))); });
        return;
      }
      if (action === 'approve' || action === 'published') {
        const id = arg ?? fail('pass a draft id');
        const by = str(flags, 'by') ?? fail('--by <your name> is required');
        const r = unwrap(core.setDraftStatus(d, id!, action === 'approve' ? 'approved' : 'published', by!, str(flags, 'evidence')));
        emit(json, r, () => { heading('Updated'); kv('status', r.status); kv('evidence', r.publishedEvidence ?? '—'); });
        return;
      }
      if (action === 'card') {
        const svg = core.socialCardSvg({
          kind: (str(flags, 'kind') ?? 'launch') as 'launch',
          title: str(flags, 'title') ?? fail('--title is required'),
          subtitle: str(flags, 'subtitle'), badge: str(flags, 'badge'),
          colors: list(flags, 'colors'), width: num(flags, 'width'), height: num(flags, 'height'),
        });
        const out = str(flags, 'out');
        if (out) { writeOut(out, svg); console.log(`Wrote ${out} (${svg.length} bytes). Convert to PNG with any local tool — no paid design API needed.`); }
        else console.log(svg);
        return;
      }
      fail(`unknown social action "${action}"`);
      return;
    }

    // ------------------------------------------------------------ growth
    case 'outreach': {
      const p = pick(d, flags);
      if (action === 'add') {
        const r = unwrap(core.addProspect(d, p.id, {
          organization: str(flags, 'org') ?? fail('--org is required'),
          website: str(flags, 'website'), contactChannel: str(flags, 'contact'),
          contactBasis: str(flags, 'basis') ?? fail('--basis is required: how do you legitimately have this contact?'),
          opportunityType: str(flags, 'type') ?? fail(`--type is required. Allowed: ${core.OPPORTUNITY_TYPES.join(', ')}`),
          relevanceReason: str(flags, 'why') ?? fail('--why is required: why would they specifically care?'),
          source: str(flags, 'source') ?? 'operator',
        }));
        emit(json, r, () => { heading('Prospect added'); kv('id', r.id); kv('organization', r.organization); });
        return;
      }
      if (action === 'list' || !action) {
        const ps = core.listProspects(d, p.id);
        emit(json, ps, () => { heading(`Prospects — ${ps.length}`); table(ps.map((x) => ({ id: x.id, organization: x.organization, type: x.opportunityType, status: x.status, basis: x.contactBasis.slice(0, 36) }))); });
        return;
      }
      if (action === 'draft') {
        const id = arg ?? fail('pass a prospect id');
        const r = unwrap(core.draftOutreach(d, id!, (str(flags, 'kind') ?? 'partnership') as 'partnership'));
        emit(json, r, () => {
          heading(`Draft for ${r.prospect}`);
          kv('channel', r.channel); kv('subject', r.subject);
          console.log('');
          console.log(r.body.split('\n').map((l) => `  ${l}`).join('\n'));
          for (const w of r.warnings) console.log(`\n  ${c.yellow('!')} ${w}`);
          console.log(`\n  ${c.grey('LaunchOS does not send messages. Send it yourself, then record it with "launchos outreach sent".')}`);
        });
        return;
      }
      if (action === 'sent') {
        const id = arg ?? fail('pass a prospect id');
        const r = unwrap(core.recordInteraction(d, id!, {
          direction: 'outbound', channel: str(flags, 'channel') ?? 'email',
          summary: str(flags, 'summary') ?? fail('--summary is required'),
          approvedBy: str(flags, 'by') ?? fail('--by <your name> is required'),
        }));
        emit(json, r, () => { heading('Interaction recorded'); kv('id', r.id); });
        return;
      }
      fail(`unknown outreach action "${action}"`);
      return;
    }

    case 'communities': {
      const p = pick(d, flags);
      if (action === 'add') {
        const r = unwrap(core.addCommunity(d, p.id, {
          name: str(flags, 'name') ?? fail('--name is required'),
          url: str(flags, 'url'), kind: str(flags, 'kind') ?? 'forum',
          selfPromotionRules: str(flags, 'rules') ?? fail('--rules is required: record their actual self-promotion rules'),
          permittedFormats: list(flags, 'formats'), relevanceReason: str(flags, 'why'),
        }));
        emit(json, r, () => { heading('Community recorded'); kv('id', r.id); kv('rules verified', r.rulesVerified); });
        return;
      }
      const cs = core.listCommunities(d, p.id);
      emit(json, cs, () => { heading(`Communities — ${cs.length}`); table(cs.map((x) => ({ name: String(x.name), kind: String(x.kind), status: String(x.status), rules: String(x.self_promotion_rules).slice(0, 50) }))); });
      return;
    }

    case 'backlinks': {
      const p = pick(d, flags);
      if (action === 'add') {
        const r = unwrap(core.addBacklink(d, p.id, {
          sourceUrl: str(flags, 'source') ?? fail('--source is required'),
          targetUrl: str(flags, 'target') ?? fail('--target is required'),
          anchor: str(flags, 'anchor'),
          origin: str(flags, 'origin') ?? fail(`--origin is required. Allowed: ${core.ALLOWED_BACKLINK_ORIGINS.join(', ')}`),
        }));
        emit(json, r, () => { heading('Backlink recorded'); kv('id', r.id); bullet('Run "launchos backlinks verify" to confirm the link is actually on the page.'); });
        return;
      }
      if (action === 'verify') {
        const r = unwrap(await core.verifyBacklinks(d, p.id));
        emit(json, r, () => {
          heading('Backlink verification');
          kv('checked', r.checked); kv('link present', c.green(String(r.present))); kv('not found', c.yellow(String(r.missing.length)));
          for (const m of r.missing) bullet(`${m.sourceUrl} — ${m.detail}`);
        });
        return;
      }
      if (action === 'opportunities') {
        const r = unwrap(core.backlinkOpportunities(d, p.id));
        emit(json, r, () => { heading('Backlink opportunities'); for (const o of r) { console.log(''); console.log(`  ${c.bold(o.strategy)}`); console.log(`     ${c.grey(o.why)}`); console.log(`     ${c.cyan('first step')} ${o.firstStep}`); } });
        return;
      }
      const bs = core.listBacklinks(d, p.id);
      emit(json, bs, () => { heading(`Backlinks — ${bs.length}`); table(bs.map((x) => ({ source: String(x.source_url).slice(0, 44), origin: String(x.origin), verified: x.verified ? 'yes' : 'no', checked: String(x.last_checked ?? '—') }))); });
      return;
    }

    case 'referral': {
      const p = pick(d, flags);
      if (action === 'create') {
        const r = unwrap(core.createReferralProgram(d, p.id, {
          name: str(flags, 'name') ?? fail('--name is required'),
          incentive: str(flags, 'incentive') ?? fail('--incentive is required'),
          disclosure: str(flags, 'disclosure') ?? fail('--disclosure is required'),
          termsUrl: str(flags, 'terms'), trackingParam: str(flags, 'param'),
        }));
        emit(json, r, () => {
          heading('Referral programme drafted');
          console.log(r.landingCopy.split('\n').map((l) => `  ${l}`).join('\n'));
          for (const w of r.warnings) console.log(`\n  ${c.yellow('!')} ${w}`);
        });
        return;
      }
      const rs = core.listReferralPrograms(d, p.id);
      emit(json, rs, () => { heading(`Referral programmes — ${rs.length}`); table(rs.map((x) => ({ name: String(x.name), incentive: String(x.incentive).slice(0, 40), status: String(x.status) }))); });
      return;
    }

    // ------------------------------------------------------------ analytics
    case 'analytics': {
      const p = pick(d, flags);
      if (action === 'import') {
        const file = arg ?? fail('pass a CSV path');
        const csv = readFileSync(resolve(file!), 'utf8');
        const r = unwrap(core.importAnalyticsCsv(d, p.id, csv, {
          provider: str(flags, 'provider') ?? 'csv',
          dimension: (str(flags, 'dimension') ?? 'page') as 'page',
          filename: file,
        }));
        emit(json, r, () => { heading('Analytics imported'); kv('rows imported', r.imported); kv('rows skipped', r.skipped); kv('columns', r.detectedColumns.join(', ')); });
        return;
      }
      if (action === 'conversion') {
        const r = unwrap(core.recordConversion(d, p.id, {
          eventName: str(flags, 'event') ?? fail('--event is required'),
          count: num(flags, 'count') ?? fail('--count is required'),
          eventDate: str(flags, 'date'), source: str(flags, 'source'), note: str(flags, 'note'),
        }));
        emit(json, r, () => { heading('Conversion recorded'); kv('id', r.id); });
        return;
      }
      const dash = unwrap(core.dashboard(d, p.id));
      emit(json, dash, () => {
        heading(`Analytics — ${p.name}`);
        if (!dash.hasData) console.log(c.yellow('  No measured data yet. Sections below show only what exists.'));
        if (dash.sources.length) { heading('Data sources'); table(dash.sources.map((s) => ({ provider: s.provider, dimension: s.dimension, rows: s.rows, imported: s.importedAt.slice(0, 10) }))); }
        if (dash.search) { heading('Search performance (imported)'); kv('rows', dash.search.rows); kv('impressions', dash.search.impressions); kv('clicks', dash.search.clicks); kv('ctr %', dash.search.ctr); kv('avg position', dash.search.avgPosition); }
        if (dash.topQueries.length) { heading('Top queries'); table(dash.topQueries.map((q) => ({ query: q.query, clicks: q.clicks ?? '—', impressions: q.impressions ?? '—', position: q.position ?? '—' }))); }
        if (dash.topPages.length) { heading('Top pages'); table(dash.topPages.map((q) => ({ page: q.url, clicks: q.clicks ?? '—', impressions: q.impressions ?? '—' }))); }
        if (dash.conversions.length) { heading('Conversions'); table(dash.conversions.map((x) => ({ event: x.eventName, total: x.total, origin: x.origin }))); }
        heading('Growth surfaces');
        kv('listings live / submitted / prepared', `${dash.listings.live} / ${dash.listings.submitted} / ${dash.listings.prepared}`);
        kv('content published / proposed', `${dash.content.published} / ${dash.content.proposed}`);
        kv('backlinks verified / unverified', `${dash.backlinks.verified} / ${dash.backlinks.unverified}`);
        kv('AI observations / mentioned / cited', `${dash.aiVisibility.observations} / ${dash.aiVisibility.mentioned} / ${dash.aiVisibility.cited}`);
        heading('Caveats'); for (const cv of dash.caveats) console.log(`  ${c.yellow('!')} ${cv}`);
      });
      return;
    }

    case 'utm': {
      const p = pick(d, flags);
      if (action === 'build') {
        const r = unwrap(core.buildUtm(d, p.id, {
          label: str(flags, 'label') ?? 'untitled',
          baseUrl: str(flags, 'url') ?? fail('--url is required'),
          source: str(flags, 'source') ?? fail('--source is required'),
          medium: str(flags, 'medium') ?? fail('--medium is required'),
          campaign: str(flags, 'campaign') ?? fail('--campaign is required'),
          content: str(flags, 'content'), term: str(flags, 'term'),
        }));
        emit(json, r, () => { heading('Tracking URL'); console.log(`  ${c.cyan(r.finalUrl)}`); console.log(''); for (const w of r.warnings) console.log(`  ${c.yellow('!')} ${w}`); });
        return;
      }
      const us = core.listUtm(d, p.id);
      emit(json, us, () => { heading(`Tracking URLs — ${us.length}`); table(us.map((x) => ({ label: String(x.label), source: String(x.utm_source), medium: String(x.utm_medium), campaign: String(x.utm_campaign), url: String(x.final_url).slice(0, 60) }))); });
      return;
    }

    case 'experiment': {
      const p = pick(d, flags);
      if (action === 'create') {
        const r = unwrap(core.createExperiment(d, p.id, {
          hypothesis: str(flags, 'hypothesis') ?? fail('--hypothesis is required'),
          change: str(flags, 'change') ?? fail('--change is required'),
          targetMetric: str(flags, 'metric') ?? fail('--metric is required'),
          startsOn: str(flags, 'start'), endsOn: str(flags, 'end'), baselineValue: num(flags, 'baseline'),
        }));
        emit(json, r, () => { heading('Experiment created'); kv('id', r.id); });
        return;
      }
      if (action === 'analyze' || action === 'analyse') {
        const id = arg ?? fail('pass an experiment id');
        const a = unwrap(core.analyzeExperiment(d, id!, {
          sampleBaseline: num(flags, 'a-n') ?? fail('--a-n (baseline sample size) is required'),
          conversionsBaseline: num(flags, 'a-c') ?? fail('--a-c (baseline conversions) is required'),
          sampleVariant: num(flags, 'b-n') ?? fail('--b-n (variant sample size) is required'),
          conversionsVariant: num(flags, 'b-c') ?? fail('--b-c (variant conversions) is required'),
        }));
        emit(json, a, () => {
          heading('Experiment analysis');
          kv('baseline rate', a.baselineRate); kv('variant rate', a.variantRate);
          kv('absolute difference', a.absoluteDifference); kv('relative change', a.relativeChange);
          kv('z score', a.zScore); kv('p value (two-sided)', a.pValueTwoSided);
          kv('significant at 95%', a.significantAt95 ? c.green('yes') : c.yellow('no'));
          kv('sample needed per group', a.minimumSampleForDetection ?? '—');
          console.log('');
          console.log(`  ${a.verdict}`);
        });
        return;
      }
      if (action === 'decide') {
        const id = arg ?? fail('pass an experiment id');
        unwrap(core.decideExperiment(d, id!, str(flags, 'decision') ?? fail('--decision is required'), str(flags, 'followup')));
        console.log('Recorded.');
        return;
      }
      const es = core.listExperiments(d, p.id);
      emit(json, es, () => { heading(`Experiments — ${es.length}`); table(es.map((x) => ({ id: String(x.id), status: String(x.status), metric: String(x.target_metric), hypothesis: String(x.hypothesis).slice(0, 50) }))); });
      return;
    }

    case 'cro': {
      const p = pick(d, flags);
      const fs = unwrap(core.landingPageAudit(d, p.id));
      emit(json, fs, () => {
        heading(`Conversion review — ${p.name}`);
        for (const f of fs) {
          const col = SEVERITY_COLOR[f.status] ?? ((s: string) => s);
          console.log('');
          console.log(`  ${col(f.status.padEnd(8))} ${c.bold(f.area)}`);
          console.log(`           ${c.grey(f.evidence)}`);
          console.log(`           ${f.suggestion}`);
        }
      });
      return;
    }

    // ------------------------------------------------------------ channels
    case 'aso': {
      const p = pick(d, flags);
      if (action === 'prepare') {
        const store = (str(flags, 'store') ?? fail('--store apple|google is required')) as 'apple';
        const r = unwrap(core.prepareAso(d, p.id, store));
        emit(json, r, () => {
          heading(`App store listing — ${r.store}`);
          for (const [k, v] of Object.entries(r.fields)) console.log(`  ${c.grey(k.padEnd(20))} ${c.grey(`(${v.length}/${r.limits[k] ?? '?'})`)} ${v.split('\n')[0]}`);
          heading('Findings'); for (const f of r.findings) console.log(`  ${c.yellow('!')} ${f}`);
          console.log(`\n  ${c.yellow('!')} ${r.costNote}`);
        });
        return;
      }
      const ls = core.listAso(d, p.id);
      emit(json, ls, () => { heading('Store listings'); table(ls.map((x) => ({ store: String(x.store), title: String(x.app_title ?? ''), updated: String(x.updated_at).slice(0, 10) }))); });
      return;
    }

    case 'local': {
      const p = pick(d, flags);
      if (action === 'set') {
        const r = unwrap(core.setLocalProfile(d, p.id, {
          businessName: str(flags, 'name') ?? fail('--name is required'),
          street: str(flags, 'street'), city: str(flags, 'city'), region: str(flags, 'region'),
          postalCode: str(flags, 'postal'), country: str(flags, 'country'), phone: str(flags, 'phone'),
          servesCustomersInPerson: flag(flags, 'in-person'), serviceAreas: list(flags, 'areas'),
        }));
        emit(json, r, () => {
          heading('Local profile saved');
          kv('GBP eligible', r.eligibility.eligible === null ? c.yellow('unknown') : r.eligibility.eligible ? c.green('yes') : c.red('no'));
          console.log(`  ${c.grey(r.eligibility.reason)}`);
          if (r.eligibility.requirements.length) { heading('Requirements'); for (const q of r.eligibility.requirements) bullet(q); }
        });
        return;
      }
      const cl = unwrap(core.localChecklist(d, p.id));
      emit(json, cl, () => { heading('Local SEO checklist'); for (const x of cl) { const col = SEVERITY_COLOR[x.status] ?? ((s: string) => s); console.log(`  ${col(x.status.padEnd(14))} ${x.item}`); console.log(`                 ${c.grey(x.detail)}`); } });
      return;
    }

    // ------------------------------------------------------------ reporting
    case 'readiness': {
      const p = pick(d, flags);
      const r = unwrap(core.launchReadiness(d, p.id));
      emit(json, r, () => {
        heading(`Launch readiness — ${r.project}`);
        kv('passed / failed / unknown', `${c.green(String(r.overall.passed))} / ${c.red(String(r.overall.failed))} / ${c.yellow(String(r.overall.unknown))} of ${r.overall.total}`);
        kv('% of known criteria passing', `${r.overall.percentOfKnown}%`);
        for (const a of r.areas) {
          heading(a.area);
          for (const cr of a.criteria) {
            const col = SEVERITY_COLOR[cr.state] ?? ((s: string) => s);
            console.log(`  ${col(cr.state.padEnd(8))} ${cr.label}`);
            console.log(`           ${c.grey(cr.evidence)}`);
            if (cr.state !== 'pass') console.log(`           ${c.cyan('fix')} ${cr.fix}`);
          }
        }
        console.log('');
        console.log(c.yellow(`  ! ${r.disclaimer}`));
      });
      return;
    }

    case 'opportunities': {
      const p = pick(d, flags);
      const os = unwrap(core.prioritize(d, p.id));
      emit(json, os, () => {
        heading(`Prioritized opportunities — ${os.length}`);
        os.slice(0, num(flags, 'limit') ?? 15).forEach((o, i) => {
          console.log('');
          console.log(`  ${c.bold(`${i + 1}. ${o.title}`)} ${c.grey(`score ${o.score} · ${o.effort} · ${o.area}`)}`);
          console.log(`     ${o.detail.split('\n').join('\n     ')}`);
          console.log(`     ${c.grey('benefit')}  ${o.strategicBenefit}`);
          console.log(`     ${c.grey('access')}   ${o.requiredAccess} (${o.costCategory.replace(/_/g, ' ')})`);
          console.log(`     ${c.grey('verify')}   ${o.verification}`);
        });
        console.log('');
        console.log(c.grey('  Ranked by relevance / effort. LaunchOS does not estimate traffic, conversion or revenue — those numbers would be invented.'));
      });
      return;
    }

    case 'report': {
      const p = pick(d, flags);
      const period = (str(flags, 'period') ?? 'weekly') as core.Period;
      const format = str(flags, 'format') ?? 'markdown';
      const r = unwrap(core.buildReport(d, p.id, period));
      const out = str(flags, 'out');
      if (format === 'csv') {
        const csv = unwrap(core.reportToCsv(d, p.id));
        if (out) { writeOut(out, csv); core.saveReport(d, p.id, r, 'csv', csv, out); console.log(`Wrote ${out}`); } else console.log(csv);
        return;
      }
      if (format === 'json') {
        const body = JSON.stringify(r, null, 2);
        if (out) { writeOut(out, body); core.saveReport(d, p.id, r, 'json', body, out); console.log(`Wrote ${out}`); } else console.log(body);
        return;
      }
      const md = core.reportToMarkdown(r);
      if (format === 'pdf') {
        const target = out ?? `reports/${p.slug}-${period}-${core.today()}.pdf`;
        const pdf = core.reportToPdf(md, `${r.project} ${period} report`);
        mkdirSync(dirname(resolve(target)), { recursive: true });
        writeFileSync(resolve(target), pdf);
        core.saveReport(d, p.id, r, 'markdown', md, target);
        console.log(`Wrote ${target} (${pdf.length} bytes)`);
        return;
      }
      if (out) { writeOut(out, md); core.saveReport(d, p.id, r, 'markdown', md, out); console.log(`Wrote ${out}`); }
      else emit(json, r, () => console.log(md));
      return;
    }

    case 'tools': {
      const ts = core.listTools(d, str(flags, 'category'));
      emit(json, ts, () => {
        heading(`Free marketing tool registry — ${ts.length}`);
        table(ts.map((t) => ({ name: t.name, category: t.category, pricing: t.pricing, account: t.accountRequired ? 'yes' : 'no', limits: (t.freeLimits ?? '').slice(0, 44) })));
        console.log(c.grey('\n  "freemium" means the capability may need a paid tier — the limits column says which.'));
      });
      return;
    }

    case 'presets': {
      emit(json, core.PRESETS, () => {
        heading('Growth presets');
        for (const id of core.PRESET_IDS) {
          const pr = core.PRESETS[id];
          console.log(`\n  ${c.bold(id)} — ${pr.label}`);
          console.log(`     ${c.grey(pr.description)}`);
          console.log(`     ${c.grey(`directories: ${pr.directoryCategories.join(', ')}`)}`);
        }
      });
      return;
    }

    default:
      fail(`unknown command "${group}". Run "launchos --help".`);
  }
}

function renderSteps(title: string, steps: { step: string; detail: string; done: boolean | null }[], notes: string[]): void {
  heading(title);
  for (const s of steps) {
    const mark = s.done === true ? c.green('done') : s.done === false ? c.red('todo') : c.yellow('n/a ');
    console.log(`  ${mark}  ${c.bold(s.step)}`);
    console.log(`        ${c.grey(s.detail)}`);
  }
  if (notes.length) { heading('Notes'); for (const n of notes) bullet(n); }
}

function writeOut(path: string, body: string): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, 'utf8');
}

async function doctor(d: Db): Promise<{ name: string; status: string; detail: string }[]> {
  const out: { name: string; status: string; detail: string }[] = [];
  const nodeOk = Number(process.versions.node.split('.')[0]) >= 22;
  out.push({ name: 'Node.js >= 22.5 (for node:sqlite)', status: nodeOk ? 'pass' : 'fail', detail: `found ${process.versions.node}` });
  out.push({ name: 'Database', status: 'pass', detail: d.path });
  const migs = d.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version');
  out.push({ name: 'Schema migrations applied', status: migs.length === core.MIGRATIONS.length ? 'pass' : 'fail', detail: `${migs.length}/${core.MIGRATIONS.length}` });
  const dirs = Number(d.get<{ n: number }>('SELECT COUNT(*) AS n FROM directory_registry')?.n ?? 0);
  out.push({ name: 'Directory registry seeded', status: dirs ? 'pass' : 'fail', detail: dirs ? `${dirs} destinations` : 'run: launchos init' });
  const projects = core.listProjects(d);
  out.push({ name: 'Projects', status: projects.length ? 'pass' : 'unknown', detail: projects.length ? projects.map((p) => p.slug).join(', ') : 'none yet' });

  const net = await core.safeFetch('https://example.com/', { maxBytes: 4000, timeoutMs: 8000 });
  out.push({ name: 'Outbound HTTPS', status: net.ok ? 'pass' : 'fail', detail: net.ok ? `HTTP ${net.value.status} from example.com` : net.error });

  const blocked = await core.assertSafeUrl('http://169.254.169.254/latest/meta-data/');
  out.push({ name: 'SSRF guard blocks link-local addresses', status: blocked.ok ? 'fail' : 'pass', detail: blocked.ok ? 'NOT BLOCKED — this is a bug, please report it' : blocked.error });

  const lh = await core.tryLighthouse('https://example.com/', 1).catch(() => null);
  out.push({
    name: 'Lighthouse (optional)',
    status: lh ? 'pass' : 'unknown',
    detail: lh ? 'installed locally' : 'not installed — audits still work; install with "npm i -g lighthouse" for lab metrics (free, needs Chrome)',
  });
  out.push({
    name: 'Paid services required',
    status: 'pass',
    detail: 'none. No AI API key, no SEO subscription, no managed database.',
  });
  return out;
}

main().catch((e) => {
  if (e instanceof ExitSignal) { process.exit(process.exitCode ?? 1); }
  console.error(`${c.red('error')} ${e instanceof Error ? e.message : String(e)}`);
  if (process.env.LAUNCHOS_DEBUG) console.error(e);
  process.exit(1);
});
