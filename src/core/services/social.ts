import { j, logEvent, type Db } from '../db';
import { clampText, err, newId, nowIso, ok, type Result } from '../util';
import { presetOf } from '../presets';
import { getBrand, getProject, type BrandProfile, type Project } from './projects';

/**
 * Platform specifications.
 *
 * Hard limits (X 280, Bluesky 300) are platform constants. Everything marked
 * `recommended` is a LaunchOS guideline for readability, not a platform rule,
 * and is labelled as such so nobody mistakes it for a spec.
 */
export type PlatformSpec = {
  id: string;
  label: string;
  hardLimit: number | null;
  recommendedLength: number;
  limitSource: 'platform_hard_limit' | 'launchos_recommendation';
  tone: string;
  media: string[];
  formats: string[];
  notes: string;
};

export const PLATFORMS: Record<string, PlatformSpec> = {
  x: {
    id: 'x', label: 'X', hardLimit: 280, recommendedLength: 240, limitSource: 'platform_hard_limit',
    tone: 'Direct and specific. One idea per post. No hashtag padding.',
    media: ['16:9 image (1600x900)', 'short video under 60s'],
    formats: ['single_post', 'thread'],
    notes: 'The 280-character limit applies to the free tier. Links consume characters.',
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', hardLimit: 3000, recommendedLength: 1300, limitSource: 'platform_hard_limit',
    tone: 'Professional but first-person. Lead with the outcome, then the method.',
    media: ['1200x627 image', 'document carousel (PDF)', 'native video'],
    formats: ['single_post', 'document_carousel', 'article'],
    notes: 'Posts are truncated with "see more" after roughly 200 characters, so the first two lines carry the post.',
  },
  instagram: {
    id: 'instagram', label: 'Instagram', hardLimit: 2200, recommendedLength: 300, limitSource: 'platform_hard_limit',
    tone: 'Visual-first. The caption supports the image, it does not replace it.',
    media: ['1080x1080 square', '1080x1350 portrait', '1080x1920 reel'],
    formats: ['single_image', 'carousel', 'reel'],
    notes: 'Caption limit 2200 characters, up to 30 hashtags. Links are not clickable in captions.',
  },
  facebook: {
    id: 'facebook', label: 'Facebook', hardLimit: 63206, recommendedLength: 400, limitSource: 'platform_hard_limit',
    tone: 'Conversational. Works best for local and community audiences.',
    media: ['1200x630 image', 'native video'], formats: ['single_post', 'photo_post', 'event'],
    notes: 'Technically a very large limit; short posts perform better.',
  },
  threads: {
    id: 'threads', label: 'Threads', hardLimit: 500, recommendedLength: 400, limitSource: 'platform_hard_limit',
    tone: 'Casual and conversational.', media: ['square or portrait image', 'short video'],
    formats: ['single_post', 'thread'], notes: 'Post limit is 500 characters.',
  },
  youtube: {
    id: 'youtube', label: 'YouTube', hardLimit: 5000, recommendedLength: 800, limitSource: 'platform_hard_limit',
    tone: 'Explain the value in the first two lines; the rest is reference material.',
    media: ['1280x720 thumbnail', '16:9 video', '9:16 Shorts'],
    formats: ['video_description', 'shorts_script', 'chapter_list'],
    notes: 'Title limit 100 characters, description 5000.',
  },
  pinterest: {
    id: 'pinterest', label: 'Pinterest', hardLimit: 500, recommendedLength: 200, limitSource: 'platform_hard_limit',
    tone: 'Descriptive and keyword-led; Pinterest behaves like a visual search engine.',
    media: ['1000x1500 vertical pin'], formats: ['pin'], notes: 'Pin description limit 500 characters, title 100.',
  },
  bluesky: {
    id: 'bluesky', label: 'Bluesky', hardLimit: 300, recommendedLength: 280, limitSource: 'platform_hard_limit',
    tone: 'Developer-friendly and plain-spoken.', media: ['landscape image'], formats: ['single_post', 'thread'],
    notes: 'Post limit is 300 characters.',
  },
  reddit: {
    id: 'reddit', label: 'Reddit', hardLimit: 40000, recommendedLength: 1200, limitSource: 'platform_hard_limit',
    tone: 'Write as a participant, not a marketer. Disclose your affiliation.',
    media: ['image', 'link'], formats: ['text_post', 'link_post'],
    notes: 'Title limit 300 characters. Every community has its own self-promotion rules — check them, and never post the same text across many subreddits.',
  },
};

export type SocialDraft = {
  id: string;
  platform: string;
  format: string;
  body: string;
  charCount: number;
  charLimit: number | null;
  mediaRequirements: string[];
  warnings: string[];
  status: 'draft' | 'review' | 'approved' | 'scheduled_for_manual_action' | 'published' | 'archived';
  scheduledFor: string | null;
  publishedEvidence: string | null;
};

export type DraftKind = 'product_announcement' | 'feature_demo' | 'educational' | 'founder_update' | 'launch_recap' | 'tutorial_outline' | 'faq' | 'release_notes';

/**
 * Generates platform-adapted copy from verified brand facts.
 *
 * Each platform gets different structure and length — the same text is never
 * duplicated across channels. No metric, customer count or testimonial is ever
 * produced: only facts present on the brand profile are used.
 */
export function generateSocialDrafts(
  d: Db,
  projectId: string,
  opts: { kind: DraftKind; platforms?: string[]; campaignId?: string; detail?: string }
): Result<SocialDraft[]> {
  const project = getProject(d, projectId);
  const brand = getBrand(d, projectId);
  if (!project || !brand) return err(`no project or brand profile for ${projectId}`);
  const preset = presetOf(project.preset);
  const platforms = (opts.platforms?.length ? opts.platforms : preset.socialPlatforms).filter((p) => PLATFORMS[p]);
  if (!platforms.length) return err(`no known platforms selected. Known: ${Object.keys(PLATFORMS).join(', ')}`);

  const out: SocialDraft[] = [];
  const ts = nowIso();

  d.tx(() => {
    for (const pid of platforms) {
      const spec = PLATFORMS[pid];
      const built = composeFor(spec, opts.kind, project, brand, opts.detail);
      const warnings = [...built.warnings];
      let body = built.body;
      if (spec.hardLimit && body.length > spec.hardLimit) {
        warnings.push(`Draft was ${body.length} characters, over the ${spec.label} hard limit of ${spec.hardLimit}. It was trimmed — read it before posting.`);
        body = clampText(body, spec.hardLimit);
      }
      const id = newId('sdraft');
      d.run(
        `INSERT INTO social_drafts (id, project_id, campaign_id, platform, format, body, char_count, char_limit,
         media_requirements_json, warnings_json, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, projectId, opts.campaignId ?? null, pid, built.format, body, body.length, spec.hardLimit,
        j.stringify(spec.media), j.stringify(warnings), 'draft', ts, ts
      );
      out.push({
        id, platform: pid, format: built.format, body, charCount: body.length, charLimit: spec.hardLimit,
        mediaRequirements: spec.media, warnings, status: 'draft', scheduledFor: null, publishedEvidence: null,
      });
    }
  });
  logEvent(d, { projectId, actor: 'user', action: 'social.generated', detail: { kind: opts.kind, platforms } });
  return ok(out);
}

function composeFor(
  spec: PlatformSpec, kind: DraftKind, project: Project, brand: BrandProfile, detail?: string
): { body: string; format: string; warnings: string[] } {
  const warnings: string[] = [];
  const url = project.websiteUrl ?? '';
  if (!url) warnings.push('No website URL on the project, so the draft has no link.');
  const name = brand.brandName;
  const what = brand.shortDescription ?? brand.tagline ?? '';
  if (!what) warnings.push('Neither a short description nor a tagline is recorded; the draft is thin as a result.');
  const problem = (brand.problemsSolved ?? '').split(/[.;\n]/)[0]?.trim() ?? '';
  const features = brand.features.slice(0, 3);
  const audience = brand.targetAudience ?? '';
  const extra = detail?.trim();

  const headline: Record<DraftKind, string> = {
    product_announcement: `${name} is live.`,
    feature_demo: features[0] ? `${name}: ${features[0]}` : `${name}`,
    educational: problem ? `How to ${problem.toLowerCase()}` : `Notes on ${name}`,
    founder_update: `An update on ${name}`,
    launch_recap: `What happened when we launched ${name}`,
    tutorial_outline: `Getting started with ${name}`,
    faq: `${name}: the questions we actually get asked`,
    release_notes: `${name} — what changed`,
  };

  switch (spec.id) {
    case 'x':
    case 'bluesky': {
      const lines = [headline[kind], what, extra, url].filter(Boolean);
      return { body: lines.join('\n\n'), format: 'single_post', warnings };
    }
    case 'linkedin': {
      const lines = [
        headline[kind],
        '',
        what,
        problem ? `\nThe problem: ${problem}.` : '',
        features.length ? `\nWhat it does:\n${features.map((f) => `• ${f}`).join('\n')}` : '',
        audience ? `\nWho it is for: ${audience}.` : '',
        extra ? `\n${extra}` : '',
        url ? `\n${url}` : '',
      ].filter((l) => l !== '');
      return { body: lines.join('\n'), format: 'single_post', warnings };
    }
    case 'instagram': {
      const lines = [headline[kind], '', what, extra, '', url ? `Link in bio: ${url}` : ''].filter((l) => l !== undefined);
      warnings.push('Instagram captions do not support clickable links; the URL is written for the bio instead.');
      if (!brand.brandColors.length) warnings.push('No brand colours recorded, so the generated visual template falls back to LaunchOS defaults.');
      return { body: lines.filter(Boolean).join('\n'), format: 'single_image', warnings };
    }
    case 'threads': {
      return { body: [headline[kind], what, url].filter(Boolean).join('\n\n'), format: 'single_post', warnings };
    }
    case 'facebook': {
      return { body: [headline[kind], '', what, problem ? `Why we built it: ${problem}.` : '', extra, url].filter(Boolean).join('\n'), format: 'single_post', warnings };
    }
    case 'youtube': {
      const body = [
        `${headline[kind]}`, '', what, '',
        features.length ? `In this video:\n${features.map((f, i) => `${i}:00 — ${f}`).join('\n')}` : '',
        '', url ? `More: ${url}` : '',
      ].filter(Boolean).join('\n');
      warnings.push('Chapter timestamps are placeholders — replace them with the real times from your edit.');
      return { body, format: 'video_description', warnings };
    }
    case 'pinterest': {
      return { body: [headline[kind], what].filter(Boolean).join(' — '), format: 'pin', warnings };
    }
    case 'reddit': {
      warnings.push('Reddit self-promotion rules vary per community. Record the specific community and its rules before posting, and disclose that you built it.');
      const body = [
        `${headline[kind]}`, '',
        what, problem ? `\nI built this because ${problem.toLowerCase()}.` : '',
        features.length ? `\nIt currently does:\n${features.map((f) => `- ${f}`).join('\n')}` : '',
        extra ? `\n${extra}` : '',
        '\nDisclosure: I am the maker.', url ? `\n${url}` : '',
      ].filter(Boolean).join('\n');
      return { body, format: 'text_post', warnings };
    }
    default:
      return { body: [headline[kind], what, url].filter(Boolean).join('\n\n'), format: 'single_post', warnings };
  }
}

export function listSocialDrafts(d: Db, projectId: string): SocialDraft[] {
  return d.all<Record<string, unknown>>('SELECT * FROM social_drafts WHERE project_id = ? ORDER BY updated_at DESC', projectId).map((r) => ({
    id: r.id as string, platform: r.platform as string, format: r.format as string, body: r.body as string,
    charCount: Number(r.char_count ?? 0), charLimit: (r.char_limit as number) ?? null,
    mediaRequirements: j.parse<string[]>(r.media_requirements_json, []),
    warnings: j.parse<string[]>(r.warnings_json, []),
    status: r.status as SocialDraft['status'], scheduledFor: (r.scheduled_for as string) ?? null,
    publishedEvidence: (r.published_evidence as string) ?? null,
  }));
}

export function setDraftStatus(
  d: Db, draftId: string, status: SocialDraft['status'], by: string, evidence?: string
): Result<SocialDraft> {
  const r = d.get<Record<string, unknown>>('SELECT * FROM social_drafts WHERE id = ?', draftId);
  if (!r) return err(`no social draft ${draftId}`);
  const warnings = j.parse<string[]>(r.warnings_json, []);
  if (status === 'approved' && warnings.length) {
    return err(`this draft has ${warnings.length} warning(s); resolve them before approving:\n- ${warnings.join('\n- ')}`);
  }
  if (status === 'published' && !evidence) {
    return err('a draft can only be marked published with evidence (the URL of the live post). LaunchOS does not publish for you and will not record an unverified publication.');
  }
  d.run(
    'UPDATE social_drafts SET status = ?, published_evidence = ?, updated_at = ? WHERE id = ?',
    status, evidence ?? (r.published_evidence as string) ?? null, nowIso(), draftId
  );
  logEvent(d, { projectId: r.project_id as string, actor: by, action: `social.${status}`, target: draftId, detail: { evidence } });
  return ok(listSocialDrafts(d, r.project_id as string).find((x) => x.id === draftId)!);
}

// ---------------------------------------------------------------- visual assets

/**
 * Renders a reusable social card as SVG.
 *
 * SVG so it needs no image library, no font downloads and no paid design API.
 * Convert to PNG with any local tool (rsvg-convert, Inkscape, ImageMagick) or
 * screenshot it with Playwright if you already have it installed.
 */
export function socialCardSvg(opts: {
  kind: 'launch' | 'feature' | 'comparison' | 'quote' | 'preview';
  title: string;
  subtitle?: string;
  badge?: string;
  colors?: string[];
  width?: number;
  height?: number;
}): string {
  const w = opts.width ?? 1200;
  const h = opts.height ?? 630;
  const [c1, c2] = opts.colors?.length ? [opts.colors[0], opts.colors[1] ?? opts.colors[0]] : ['#2563EB', '#06B6D4'];
  const title = wrapText(opts.title, opts.kind === 'quote' ? 28 : 24, 3);
  const sub = opts.subtitle ? wrapText(opts.subtitle, 56, 2) : [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const titleSize = title.length > 2 ? 62 : 76;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(opts.title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#080F1F"/>
  <rect x="0" y="0" width="${w}" height="8" fill="url(#g)"/>
  <circle cx="${w - 90}" cy="${h - 90}" r="180" fill="url(#g)" opacity="0.10"/>
  ${opts.badge ? `<g><rect x="72" y="72" rx="18" width="${Math.min(520, 26 + opts.badge.length * 17)}" height="52" fill="url(#g)" opacity="0.18"/><text x="96" y="107" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" font-size="24" font-weight="600" fill="${c2}">${esc(opts.badge)}</text></g>` : ''}
  <g font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial" fill="#F8FAFC">
    ${title.map((line, i) => `<text x="72" y="${(opts.badge ? 236 : 196) + i * (titleSize + 14)}" font-size="${titleSize}" font-weight="700">${esc(line)}</text>`).join('\n    ')}
    ${sub.map((line, i) => `<text x="72" y="${(opts.badge ? 236 : 196) + title.length * (titleSize + 14) + 34 + i * 40}" font-size="30" fill="#64748B">${esc(line)}</text>`).join('\n    ')}
  </g>
</svg>`;
}

function wrapText(text: string, perLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    if ((cur + ' ' + word).trim().length > perLine && cur) {
      lines.push(cur.trim());
      cur = word;
      if (lines.length === maxLines) break;
    } else cur = `${cur} ${word}`.trim();
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (consumed < words.length) lines[maxLines - 1] = clampText(lines[maxLines - 1], perLine - 1) + '…';
  }
  return lines;
}
