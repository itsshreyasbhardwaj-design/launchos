/**
 * Registry of free and freemium marketing tools.
 *
 * `pricing` is 'free' only where the capability named in `capability` is usable
 * without payment. Anything gated behind a paid tier is 'freemium' with the
 * limit spelled out — a freemium product is never described as free.
 * `verificationStatus` is 'unverified' for seed rows: pricing and free limits
 * change, and LaunchOS does not pretend to know today's terms.
 */
export type ToolSeed = {
  slug: string;
  name: string;
  url: string;
  category: string;
  capability: string;
  pricing: 'free' | 'freemium' | 'open_source' | 'paid';
  freeLimits?: string;
  accountRequired: boolean;
  privacyNote?: string;
};

export const TOOL_SEEDS: ToolSeed[] = [
  { slug: 'google-search-console', name: 'Google Search Console', url: 'https://search.google.com/search-console', category: 'search_console', capability: 'Impressions, clicks, queries and index coverage for your verified site', pricing: 'free', freeLimits: 'Query data retained for 16 months; UI exports capped at 1000 rows, the API returns more.', accountRequired: true, privacyNote: 'Requires proving domain ownership. Shares your site data with Google.' },
  { slug: 'bing-webmaster-tools', name: 'Bing Webmaster Tools', url: 'https://www.bing.com/webmasters', category: 'search_console', capability: 'Bing search performance, index diagnostics, sitemap submission, IndexNow key management', pricing: 'free', accountRequired: true, privacyNote: 'Also feeds Copilot-facing surfaces. Supports importing verification from Search Console.' },
  { slug: 'google-analytics', name: 'Google Analytics 4', url: 'https://analytics.google.com', category: 'analytics', capability: 'Session, event and conversion analytics', pricing: 'freemium', freeLimits: 'Standard GA4 is free with data-retention limits and sampling on large properties; GA360 is paid.', accountRequired: true, privacyNote: 'Third-party analytics with consent implications under GDPR and the DPDP Act. Consider a self-hosted alternative.' },
  { slug: 'umami', name: 'Umami', url: 'https://umami.is', category: 'analytics', capability: 'Self-hosted, cookie-free web analytics', pricing: 'open_source', freeLimits: 'Free when self-hosted; the managed cloud tier is paid above a free quota.', accountRequired: false, privacyNote: 'Self-hosting keeps visitor data on your own infrastructure.' },
  { slug: 'goatcounter', name: 'GoatCounter', url: 'https://www.goatcounter.com', category: 'analytics', capability: 'Lightweight privacy-friendly page analytics', pricing: 'freemium', freeLimits: 'Free for non-commercial use; self-hosting is always free.', accountRequired: true, privacyNote: 'No cookies and no cross-site tracking by design.' },
  { slug: 'microsoft-clarity', name: 'Microsoft Clarity', url: 'https://clarity.microsoft.com', category: 'behavioural_analytics', capability: 'Session recordings and heatmaps', pricing: 'free', accountRequired: true, privacyNote: 'Session recording captures real visitor behaviour. Check provider terms and your own privacy policy, and do not deploy it on sites aimed at children or handling sensitive data.' },
  { slug: 'lighthouse', name: 'Lighthouse', url: 'https://developer.chrome.com/docs/lighthouse/overview', category: 'performance', capability: 'Lab audits for performance, accessibility, best practices and SEO', pricing: 'open_source', freeLimits: 'Fully free. Needs a local Chrome install.', accountRequired: false },
  { slug: 'pagespeed-insights', name: 'PageSpeed Insights', url: 'https://pagespeed.web.dev', category: 'performance', capability: 'Lab Lighthouse run plus real-user Core Web Vitals field data where available', pricing: 'free', freeLimits: 'Field data only appears once a URL or origin has enough real traffic in the Chrome UX Report.', accountRequired: false },
  { slug: 'chrome-ux-report', name: 'Chrome UX Report', url: 'https://developer.chrome.com/docs/crux', category: 'performance', capability: 'Public real-user Core Web Vitals dataset', pricing: 'free', freeLimits: 'Only covers origins and URLs with sufficient traffic.', accountRequired: false },
  { slug: 'schema-markup-validator', name: 'Schema Markup Validator', url: 'https://validator.schema.org', category: 'structured_data', capability: 'Validates Schema.org markup syntax', pricing: 'free', accountRequired: false },
  { slug: 'rich-results-test', name: 'Google Rich Results Test', url: 'https://search.google.com/test/rich-results', category: 'structured_data', capability: 'Checks eligibility for Google rich results', pricing: 'free', accountRequired: false },
  { slug: 'google-trends', name: 'Google Trends', url: 'https://trends.google.com', category: 'trend_research', capability: 'Relative search interest over time and by region', pricing: 'free', freeLimits: 'Returns relative interest indices, never absolute search volume.', accountRequired: false },
  { slug: 'google-keyword-planner', name: 'Google Keyword Planner', url: 'https://ads.google.com/home/tools/keyword-planner/', category: 'keyword_research', capability: 'Keyword ideas with volume ranges', pricing: 'freemium', freeLimits: 'Needs a Google Ads account. Without active spend, volumes are shown as wide buckets rather than precise numbers.', accountRequired: true },
  { slug: 'bing-keyword-research', name: 'Bing Webmaster keyword research', url: 'https://www.bing.com/webmasters', category: 'keyword_research', capability: 'Keyword ideas and Bing impression data for your verified site', pricing: 'free', accountRequired: true },
  { slug: 'wikipedia-wikidata', name: 'Wikidata', url: 'https://www.wikidata.org', category: 'entity_data', capability: 'Structured entity data that search and AI systems consume', pricing: 'open_source', accountRequired: false, privacyNote: 'Notability rules apply: do not create an entry for a company that does not meet them.' },
  { slug: 'gimp', name: 'GIMP', url: 'https://www.gimp.org', category: 'design', capability: 'Raster image editing', pricing: 'open_source', accountRequired: false },
  { slug: 'inkscape', name: 'Inkscape', url: 'https://inkscape.org', category: 'design', capability: 'Vector graphics and SVG editing', pricing: 'open_source', accountRequired: false },
  { slug: 'ffmpeg', name: 'FFmpeg', url: 'https://ffmpeg.org', category: 'video', capability: 'Video and audio transcoding, trimming and composition from the command line', pricing: 'open_source', accountRequired: false },
  { slug: 'shotcut', name: 'Shotcut', url: 'https://shotcut.org', category: 'video', capability: 'Cross-platform non-linear video editing', pricing: 'open_source', accountRequired: false },
  { slug: 'obs-studio', name: 'OBS Studio', url: 'https://obsproject.com', category: 'video', capability: 'Screen recording and live streaming for demo videos', pricing: 'open_source', accountRequired: false },
  { slug: 'playwright', name: 'Playwright', url: 'https://playwright.dev', category: 'screenshot_capture', capability: 'Scripted browser screenshots at any viewport, plus end-to-end testing', pricing: 'open_source', accountRequired: false },
  { slug: 'imagemagick', name: 'ImageMagick', url: 'https://imagemagick.org', category: 'design', capability: 'Batch image conversion and resizing for listing assets', pricing: 'open_source', accountRequired: false },
  { slug: 'listmonk', name: 'Listmonk', url: 'https://listmonk.app', category: 'email', capability: 'Self-hosted newsletter and mailing-list manager', pricing: 'open_source', freeLimits: 'Free software; you still need an SMTP sender, which may cost money at volume.', accountRequired: false, privacyNote: 'Only email people who opted in. Bulk unsolicited email is both illegal in many jurisdictions and prohibited by LaunchOS.' },
  { slug: 'indexnow', name: 'IndexNow', url: 'https://www.indexnow.org', category: 'search_indexing', capability: 'Notifies participating search engines that a URL changed', pricing: 'free', freeLimits: 'Requires hosting a key file on the domain. Acceptance of a notification is not a guarantee of indexing.', accountRequired: false },
  { slug: 'screaming-frog', name: 'Screaming Frog SEO Spider', url: 'https://www.screamingfrog.co.uk/seo-spider/', category: 'site_auditing', capability: 'Desktop site crawler', pricing: 'freemium', freeLimits: 'Free edition is limited to 500 URLs per crawl and omits several reports.', accountRequired: false },
  { slug: 'wave', name: 'WAVE accessibility tool', url: 'https://wave.webaim.org', category: 'accessibility', capability: 'In-page accessibility evaluation', pricing: 'free', accountRequired: false },
  { slug: 'axe-devtools', name: 'axe DevTools browser extension', url: 'https://www.deque.com/axe/devtools/', category: 'accessibility', capability: 'Automated accessibility issue detection in the browser', pricing: 'freemium', freeLimits: 'The free extension covers automated checks; guided and enterprise testing is paid.', accountRequired: false },
  { slug: 'hugo', name: 'Hugo', url: 'https://gohugo.io', category: 'content_management', capability: 'Static site generator for fast, crawlable content sites', pricing: 'open_source', accountRequired: false },
  { slug: 'github-actions', name: 'GitHub Actions', url: 'https://github.com/features/actions', category: 'automation', capability: 'Scheduled and event-driven CI automation', pricing: 'freemium', freeLimits: 'Unlimited minutes for public repositories; private repositories get a monthly free allowance on the free plan, then billing applies.', accountRequired: true, privacyNote: 'Never commit credentials. Use repository secrets.' },
  { slug: 'github-pages', name: 'GitHub Pages', url: 'https://pages.github.com', category: 'hosting', capability: 'Free static hosting with HTTPS and custom domains', pricing: 'free', freeLimits: 'Soft limits on site size and bandwidth; not for heavy dynamic workloads.', accountRequired: true },
  { slug: 'cloudflare-pages', name: 'Cloudflare Pages', url: 'https://pages.cloudflare.com', category: 'hosting', capability: 'Free static and edge-function hosting with HTTPS', pricing: 'freemium', freeLimits: 'Generous free tier with build-minute and function-invocation caps.', accountRequired: true },
];

export const TOOL_CATEGORIES = [...new Set(TOOL_SEEDS.map((t) => t.category))].sort();
