/**
 * LaunchOS core.
 *
 * Both the web dashboard and the CLI import from here, so there is exactly one
 * implementation of every rule. Nothing in this directory touches React or
 * Next.js, and nothing requires a paid service.
 */
export * from './util';
export * from './presets';
export { openDb, db, setSharedDb, migrate, logEvent, type Db } from './db';
export { MIGRATIONS } from './db/migrations';

export * from './html/parse';
export { assertSafeUrl, safeFetch, isPrivateAddress, HostThrottle, DEFAULTS as FETCH_DEFAULTS } from './net/safe-fetch';
export { fetchRobots, parseRobots, isAllowed, matchRobotsPath, type Robots } from './net/robots';
export { fetchSitemap, collectSitemapUrls, type SitemapResult } from './net/sitemap';

export { extractPage, safeHost, type PageFacts } from './audit/extract';
export { runChecks, normalizeForCompare, headingSkips, type Finding, type Severity, type SiteContext } from './audit/checks';
export { validateJsonLd, type SchemaCheck } from './audit/schema-validate';
export { detectFramework, fixFor, type Framework } from './audit/fixes';
export { runAudit, sortFindings, type AuditResult } from './audit/engine';
export { tryLighthouse, responseTiming } from './audit/lighthouse';

export * from './services/projects';
export * from './services/registry';
export * from './services/listings';
export * from './services/audits';
export * from './services/seo';
export * from './services/geo';
export * from './services/content';
export * from './services/social';
export * from './services/launch';
export * from './services/outreach';
export * from './services/analytics';
export * from './services/readiness';
export * from './services/reports';
export * from './services/searchengines';
export * from './services/channels';

export { DIRECTORY_SEEDS, DIRECTORY_CATEGORIES } from './data/directories';
export { TOOL_SEEDS, TOOL_CATEGORIES } from './data/tools';
