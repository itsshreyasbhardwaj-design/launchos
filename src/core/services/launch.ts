import { j, logEvent, type Db } from '../db';
import { err, newId, nowIso, ok, today, type Result } from '../util';
import { presetOf } from '../presets';
import { brandCompleteness, getBrand, getProject } from './projects';
import { latestAudit } from './audits';

export type ChecklistItem = { id: string; label: string; status: 'ready' | 'blocked' | 'manual'; detail: string };
export type Playbook = {
  id: string;
  name: string;
  destination: string;
  policyNotes: string[];
  readiness: ChecklistItem[];
  assets: string[];
  copy: Record<string, string>;
  schedule: { phase: string; whenRelativeToLaunch: string; tasks: string[] }[];
  automationBoundary: string;
};

/**
 * Launch playbooks.
 *
 * Every playbook stops at the point where a human must act. LaunchOS prepares
 * assets and checks readiness from real evidence; it never posts, never asks
 * for votes, and never coordinates engagement.
 */
export function buildPlaybook(d: Db, projectId: string, playbookId: string): Result<Playbook> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const preset = presetOf(project.preset);
  if (!preset.launchPlaybooks.includes(playbookId) && playbookId !== 'product_hunt') {
    return err(`playbook "${playbookId}" is not relevant to the ${preset.label} preset. Available: ${preset.launchPlaybooks.join(', ')}`);
  }

  const completeness = brandCompleteness(d, projectId);
  const audit = latestAudit(d, projectId);
  const criticalFindings = audit
    ? d.all<{ title: string }>("SELECT title FROM audit_findings WHERE audit_id = ? AND severity IN ('critical','high')", audit.id)
    : [];

  const base: ChecklistItem[] = [
    {
      id: 'brand.complete',
      label: 'Canonical brand profile is filled in',
      status: completeness.missing.length ? 'blocked' : 'ready',
      detail: completeness.missing.length ? `Missing: ${completeness.missing.join(', ')}` : `All required fields present (${completeness.score}%).`,
    },
    {
      id: 'brand.verified',
      label: 'Brand facts marked verified',
      status: completeness.unverified.length ? 'manual' : 'ready',
      detail: completeness.unverified.length
        ? `Not yet marked verified: ${completeness.unverified.join(', ')}. Mark them with "launchos brand verify".`
        : 'Every required field is marked verified.',
    },
    {
      id: 'site.audited',
      label: 'Site audit passes with no critical or high findings',
      status: !audit ? 'blocked' : criticalFindings.length ? 'blocked' : 'ready',
      detail: !audit ? 'No completed audit. Run "launchos audit".' : criticalFindings.length ? `${criticalFindings.length} open: ${criticalFindings.slice(0, 4).map((f) => f.title).join('; ')}` : 'Clean.',
    },
    {
      id: 'product.usable',
      label: 'The product is usable by a stranger right now',
      status: project.launchStatus === 'pre_launch' ? 'blocked' : 'manual',
      detail: project.launchStatus === 'pre_launch'
        ? 'Project is marked pre-launch. Launch platforms expect something people can actually use.'
        : 'Only you can confirm this. Hand it to someone who has never seen it and watch them try.',
    },
  ];

  const playbooks: Record<string, () => Playbook> = {
    product_hunt: () => ({
      id: 'product_hunt', name: 'Product Hunt launch', destination: 'https://www.producthunt.com',
      policyNotes: [
        'Asking for, buying or organising upvotes violates Product Hunt policy and gets launches removed. LaunchOS will not help with it.',
        'Launch as the maker of the product, not on someone else\'s behalf without permission.',
        'The gallery must show the real product, not mockups of features that do not exist.',
      ],
      readiness: [
        ...base,
        { id: 'ph.gallery', label: 'Gallery of 3-5 real screenshots', status: 'manual', detail: 'At least 1270x760. Show the product doing the thing, not a landing page.' },
        { id: 'ph.video', label: 'Optional 30-60s demo video', status: 'manual', detail: 'A plain screen recording with no music outperforms a produced trailer for most tools.' },
        { id: 'ph.firstcomment', label: 'Maker comment written in your own words', status: 'manual', detail: 'Why you built it, what it does not do yet, and what feedback you want.' },
      ],
      assets: ['Thumbnail 240x240', 'Gallery images 1270x760 or larger', 'Optional demo video', 'Tagline under 60 characters'],
      copy: {
        name: brand.brandName,
        tagline: (brand.tagline ?? '').slice(0, 60),
        description: (brand.shortDescription ?? '').slice(0, 260),
        maker_comment_outline: [
          `I built ${brand.brandName} because ${(brand.problemsSolved ?? '[fill in the problem]').split(/[.;\n]/)[0]}.`,
          '',
          'What it does today:',
          ...brand.features.slice(0, 4).map((f) => `- ${f}`),
          '',
          'What it does not do yet: [be specific — this is the part people trust]',
          '',
          'What I would like feedback on: [one concrete question]',
        ].join('\n'),
      },
      schedule: [
        { phase: 'Pre-launch', whenRelativeToLaunch: '-14 days', tasks: ['Fix every critical and high audit finding', 'Finish the gallery and demo video', 'Make sure signup works from a clean browser'] },
        { phase: 'Pre-launch', whenRelativeToLaunch: '-3 days', tasks: ['Write the maker comment', 'Check the site holds up under a traffic spike', 'Prepare platform-specific social drafts (do not schedule auto-posts)'] },
        { phase: 'Launch day', whenRelativeToLaunch: '0', tasks: ['Publish the launch yourself', 'Post the maker comment', 'Answer every comment personally', 'Share on your own channels — without asking for upvotes'] },
        { phase: 'Post-launch', whenRelativeToLaunch: '+1 to +7 days', tasks: ['Reply to remaining comments', 'Record what you actually measured', 'Turn recurring questions into FAQ content', 'Update listings with anything you learned'] },
      ],
      automationBoundary: 'LaunchOS prepares copy and assets and tracks the checklist. You publish the launch and write the comments.',
    }),

    show_hn: () => ({
      id: 'show_hn', name: 'Show HN preparation', destination: 'https://news.ycombinator.com/showhn.html',
      policyNotes: [
        'Show HN requires your own work that readers can try. A signup wall usually gets a hostile response.',
        'Vote manipulation is a bannable offence, for you and anyone you ask.',
        'LaunchOS deliberately does not draft your submission text. A Show HN written by a tool reads like one, and the audience notices. What follows is factual notes for you to write from.',
      ],
      readiness: [
        ...base,
        { id: 'hn.tryable', label: 'A stranger can try it without signing up or paying', status: 'manual', detail: 'A demo, a sandbox, a binary or a repo. If everything is behind a signup, Show HN is the wrong venue.' },
        { id: 'hn.original', label: 'It is your own work', status: 'manual', detail: 'Show HN is for things you made.' },
        { id: 'hn.technical', label: 'There is something technically interesting to say', status: 'manual', detail: 'What was hard, what you chose, what you rejected.' },
      ],
      assets: ['A URL that works without an account', 'A README that explains the project in its first paragraph'],
      copy: {
        facts_for_you_to_write_from: [
          `Product: ${brand.brandName}`,
          `What it does: ${brand.shortDescription ?? '[not recorded]'}`,
          `Problem: ${(brand.problemsSolved ?? '[not recorded]').split(/[.;\n]/)[0]}`,
          `Try it: ${project.websiteUrl ?? '[no URL recorded]'}`,
          brand.githubUrl ? `Source: ${brand.githubUrl}` : 'Source: [not public]',
          `Features recorded: ${brand.features.join('; ') || '[none recorded]'}`,
          '',
          'Write the post yourself. Title format: "Show HN: <what it is>". Say what it does, what it does not do,',
          'and what you want feedback on. No marketing adjectives.',
        ].join('\n'),
      },
      schedule: [
        { phase: 'Pre-launch', whenRelativeToLaunch: '-7 days', tasks: ['Make the demo work without signup', 'Rewrite the README opening paragraph', 'Fix critical audit findings'] },
        { phase: 'Launch day', whenRelativeToLaunch: '0', tasks: ['Write and submit the post in your own words', 'Stay available to answer technical questions for several hours'] },
        { phase: 'Post-launch', whenRelativeToLaunch: '+1 day', tasks: ['Turn the sharpest criticism into issues', 'Record what you measured'] },
      ],
      automationBoundary: 'LaunchOS will not generate or post a Show HN submission. It gives you verified facts and a readiness check.',
    }),

    github_release: () => ({
      id: 'github_release', name: 'GitHub repository and release', destination: brand.githubUrl ?? 'https://github.com',
      policyNotes: ['Never publish secrets, private source or customer data.', 'A licence file is what makes the project usable by others — without one, nobody can legally depend on it.'],
      readiness: [
        ...base,
        { id: 'gh.exists', label: 'Public repository recorded', status: brand.githubUrl ? 'ready' : 'blocked', detail: brand.githubUrl ?? 'Record the repository URL on the brand profile.' },
        { id: 'gh.description', label: 'Repository description and topics set', status: 'manual', detail: 'Description is capped at 350 characters; a repo takes up to 20 topics. Both are search surfaces.' },
        { id: 'gh.readme', label: 'README answers what/why/how in the first screen', status: 'manual', detail: 'What it is, why it exists, how to install, one runnable example.' },
        { id: 'gh.licence', label: 'LICENSE file present', status: 'manual', detail: 'Pick a licence deliberately. No licence means all rights reserved.' },
        { id: 'gh.release', label: 'A tagged release with notes', status: 'manual', detail: 'Tag it and write what changed. Releases are indexed and subscribed to.' },
        { id: 'gh.social_preview', label: 'Social preview image uploaded', status: 'manual', detail: '1280x640. Generate one with "launchos social card".' },
      ],
      assets: ['Repository description (<=350 chars)', 'Up to 20 topics', 'Social preview 1280x640', 'README screenshots', 'CONTRIBUTING.md', 'Issue templates'],
      copy: {
        repo_description: (brand.shortDescription ?? brand.tagline ?? '').slice(0, 350),
        topics: suggestTopics(project.category, brand.features).join(', '),
      },
      schedule: [
        { phase: 'Pre-release', whenRelativeToLaunch: '-3 days', tasks: ['Finish README and examples', 'Add LICENSE, CONTRIBUTING and issue templates', 'Set description and topics'] },
        { phase: 'Release day', whenRelativeToLaunch: '0', tasks: ['Tag the release and write notes', 'Upload the social preview'] },
        { phase: 'Post-release', whenRelativeToLaunch: '+7 days', tasks: ['Reply to every issue', 'Record which examples people actually ran'] },
      ],
      automationBoundary: 'LaunchOS generates metadata and checklists. It does not push to your repository or create releases.',
    }),

    community_launch: () => ({
      id: 'community_launch', name: 'Community launch kit', destination: 'the specific communities you have recorded',
      policyNotes: [
        'Every community has its own self-promotion rules. Record them per community before planning anything.',
        'Do not post the same text in several places. LaunchOS generates platform-specific drafts for exactly this reason.',
        'Disclose that you made the thing.',
      ],
      readiness: [
        ...base,
        { id: 'comm.recorded', label: 'At least one community with verified rules', status: communityCount(d, projectId) ? 'ready' : 'blocked', detail: `${communityCount(d, projectId)} community/communities recorded with rules verified.` },
      ],
      assets: ['One adapted draft per community', 'A screenshot or demo link'],
      copy: { guidance: 'Use "launchos social generate" per platform, then edit each draft so it reads like you wrote it for that specific community.' },
      schedule: [
        { phase: 'Pre-launch', whenRelativeToLaunch: '-7 days', tasks: ['Record each community and its rules', 'Participate genuinely before you post about your own thing'] },
        { phase: 'Launch', whenRelativeToLaunch: '0', tasks: ['Post one adapted message per community, spaced out', 'Answer replies yourself'] },
      ],
      automationBoundary: 'LaunchOS will not post to communities and will not generate promotional replies.',
    }),
  };

  const generic = (): Playbook => ({
    id: playbookId, name: playbookId.replace(/_/g, ' '), destination: project.websiteUrl ?? '',
    policyNotes: ['Require explicit approval before anything is published.'],
    readiness: base, assets: [], copy: {},
    schedule: [
      { phase: 'Pre-launch', whenRelativeToLaunch: '-7 days', tasks: ['Clear critical audit findings', 'Complete the brand profile'] },
      { phase: 'Launch', whenRelativeToLaunch: '0', tasks: ['Publish', 'Respond to feedback'] },
      { phase: 'Post-launch', whenRelativeToLaunch: '+7 days', tasks: ['Record measured outcomes'] },
    ],
    automationBoundary: 'Preparation only.',
  });

  const pb = (playbooks[playbookId] ?? generic)();
  logEvent(d, { projectId, actor: 'user', action: 'launch.playbook', target: playbookId });
  return ok(pb);
}

const communityCount = (d: Db, projectId: string): number =>
  Number((d.get<{ n: number }>('SELECT COUNT(*) AS n FROM communities WHERE project_id = ? AND rules_verified = 1', projectId)?.n) ?? 0);

function suggestTopics(category: string | null, features: string[]): string[] {
  const words = [category ?? '', ...features].join(' ').toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'your', 'from', 'into', 'all', 'any', 'can', 'are']);
  return [...new Set(words.filter((w) => !stop.has(w)))].slice(0, 20);
}

/** Materialises a playbook's schedule as dated, trackable tasks. */
export function scheduleLaunch(d: Db, projectId: string, playbookId: string, launchDate: string): Result<{ created: number }> {
  const pb = buildPlaybook(d, projectId, playbookId);
  if (!pb.ok) return pb;
  const launch = new Date(launchDate);
  if (Number.isNaN(launch.getTime())) return err(`"${launchDate}" is not a valid date (use YYYY-MM-DD)`);
  let created = 0;
  const ts = nowIso();
  d.tx(() => {
    for (const phase of pb.value.schedule) {
      const offset = Number((phase.whenRelativeToLaunch.match(/-?\d+/) ?? ['0'])[0]);
      const due = new Date(launch.getTime() + offset * 86400000).toISOString().slice(0, 10);
      for (const t of phase.tasks) {
        d.run(
          `INSERT INTO tasks (id, project_id, title, detail, area, kind, priority_score, status, requires_approval, due_on, source, source_ref, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          newId('task'), projectId, t, `${pb.value.name} — ${phase.phase} (${phase.whenRelativeToLaunch} days)`,
          'launch', 'action', offset <= 0 ? 80 : 50, 'open', 0, due, 'launch_playbook', playbookId, ts, ts
        );
        created++;
      }
    }
  });
  logEvent(d, { projectId, actor: 'user', action: 'launch.scheduled', target: playbookId, detail: { launchDate, created } });
  return ok({ created });
}

// ---------------------------------------------------------------- campaigns

export const CAMPAIGN_TEMPLATES: Record<string, { objective: string; channels: string[]; plannedContent: string[] }> = {
  new_saas_launch: { objective: 'Get the first cohort of real users and learn what they struggle with', channels: ['product_hunt', 'linkedin', 'x', 'directories', 'content'], plannedContent: ['Launch announcement', 'Founder story', 'Getting-started tutorial', 'FAQ page'] },
  product_hunt_launch: { objective: 'Run a clean Product Hunt launch and convert the traffic', channels: ['product_hunt', 'x', 'linkedin'], plannedContent: ['PH gallery', 'Maker comment', 'Launch-day posts', 'Post-launch recap'] },
  open_source_release: { objective: 'Reach developers who have the problem the project solves', channels: ['github', 'show_hn', 'dev_publishing', 'x'], plannedContent: ['README rewrite', 'Release notes', 'Technical deep-dive', 'Example project'] },
  developer_tool_launch: { objective: 'Earn adoption through documentation and working examples', channels: ['github', 'dev_publishing', 'directories', 'communities'], plannedContent: ['Quickstart', 'Integration guides', 'Comparison page', 'Tutorial series'] },
  mobile_app_launch: { objective: 'Improve store conversion and earn organic installs', channels: ['app_stores', 'instagram', 'directories', 'content'], plannedContent: ['Store listing copy', 'Screenshot set', 'Preview video script', 'Release notes'] },
  local_business_launch: { objective: 'Be findable for local intent and earn genuine reviews', channels: ['local_listings', 'facebook', 'instagram', 'content'], plannedContent: ['Service pages', 'Location page', 'FAQ', 'Review request policy'] },
  feature_release: { objective: 'Tell existing and prospective users what changed and why', channels: ['content', 'linkedin', 'x', 'email'], plannedContent: ['Release notes', 'Feature page', 'Demo video', 'Changelog entry'] },
  educational_content: { objective: 'Build organic discovery through genuinely useful material', channels: ['content', 'dev_publishing', 'youtube'], plannedContent: ['Tutorial series', 'Original research', 'Explainers'] },
  founder_announcement: { objective: 'Share a milestone in the founder\'s own voice', channels: ['linkedin', 'x'], plannedContent: ['Founder post', 'Behind-the-scenes thread'] },
  seo_content_refresh: { objective: 'Recover and grow organic performance on pages that already exist', channels: ['content'], plannedContent: ['Refresh list', 'Updated screenshots', 'Internal linking pass'] },
};

export function createCampaign(
  d: Db,
  projectId: string,
  input: { name: string; template?: string; objective?: string; audience?: string; region?: string; startsOn?: string; endsOn?: string; channels?: string[] }
): Result<{ id: string; name: string; objective: string; channels: string[]; plannedContent: string[] }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const tpl = input.template ? CAMPAIGN_TEMPLATES[input.template] : undefined;
  if (input.template && !tpl) return err(`unknown template "${input.template}". Available: ${Object.keys(CAMPAIGN_TEMPLATES).join(', ')}`);
  const objective = input.objective ?? tpl?.objective;
  if (!objective) return err('an objective is required (or pick a template)');
  const channels = input.channels ?? tpl?.channels ?? [];
  const id = newId('camp');
  const ts = nowIso();
  d.run(
    `INSERT INTO campaigns (id, project_id, name, template, objective, audience, region, starts_on, ends_on, channels_json, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.name, input.template ?? null, objective, input.audience ?? null, input.region ?? null,
    input.startsOn ?? today(), input.endsOn ?? null, j.stringify(channels), 'planned', ts, ts
  );
  logEvent(d, { projectId, actor: 'user', action: 'campaign.created', target: id });
  return ok({ id, name: input.name, objective, channels, plannedContent: tpl?.plannedContent ?? [] });
}

export function listCampaigns(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM campaigns WHERE project_id = ? ORDER BY created_at DESC', projectId);
}

export function setCampaignOutcome(d: Db, campaignId: string, status: string, outcome: string): Result<{ id: string }> {
  if (!d.get('SELECT id FROM campaigns WHERE id = ?', campaignId)) return err(`no campaign ${campaignId}`);
  d.run('UPDATE campaigns SET status = ?, outcome_summary = ?, updated_at = ? WHERE id = ?', status, outcome, nowIso(), campaignId);
  return ok({ id: campaignId });
}

// ---------------------------------------------------------------- publishing approvals

/**
 * Anything that would touch the outside world goes through here first.
 *
 * A publishing task is created in `awaiting_approval` and can only move on
 * after a named human approves it. Nothing in LaunchOS publishes on its own.
 */
export function createPublishingTask(
  d: Db,
  projectId: string,
  input: { kind: string; refId?: string; destination: string; instructions: string }
): Result<{ id: string }> {
  if (!getProject(d, projectId)) return err(`no project ${projectId}`);
  const id = newId('ptask');
  d.run(
    `INSERT INTO publishing_tasks (id, project_id, kind, ref_id, destination, instructions, requires_approval, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, projectId, input.kind, input.refId ?? null, input.destination, input.instructions, 1, 'awaiting_approval', nowIso()
  );
  return ok({ id });
}

export function approvePublishingTask(d: Db, taskId: string, by: string): Result<{ id: string; status: string }> {
  const t = d.get<Record<string, unknown>>('SELECT * FROM publishing_tasks WHERE id = ?', taskId);
  if (!t) return err(`no publishing task ${taskId}`);
  if (!by.trim()) return err('an approver name is required');
  d.run(
    "UPDATE publishing_tasks SET status = 'approved_for_manual_action', approved_by = ?, approved_at = ? WHERE id = ?",
    by, nowIso(), taskId
  );
  logEvent(d, { projectId: t.project_id as string, actor: by, action: 'publishing.approved', target: taskId });
  return ok({ id: taskId, status: 'approved_for_manual_action' });
}

export function listPublishingTasks(d: Db, projectId: string): Record<string, unknown>[] {
  return d.all('SELECT * FROM publishing_tasks WHERE project_id = ? ORDER BY created_at DESC', projectId);
}
