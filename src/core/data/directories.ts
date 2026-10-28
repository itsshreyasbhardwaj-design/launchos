/**
 * Seed catalogue of REAL discovery and listing destinations.
 *
 * Honesty rules baked into this file:
 *  - Nothing here is invented. Every `officialUrl` is a destination that exists.
 *  - `submissionUrl` is only filled in where the path is well known. Where it is
 *    not, it is null and the operator is told to find the official path.
 *  - `freeSubmission` is 'free' ONLY where free self-submission is the documented
 *    norm. Anything we are not certain about is 'unknown' — never optimistically
 *    'free'. A listing cannot reach "ready for submission" while this is 'unknown'
 *    or 'paid' without the operator confirming it themselves.
 *  - `verificationStatus` starts at 'unverified' for every row, because this file
 *    is seed data, not a live check. `launchos directories verify` performs real
 *    HTTP checks and records the date. Reachability is NOT the same as confirming
 *    free submission, and the two are tracked separately.
 *  - `fieldLimits` marked `conservative_default` are LaunchOS defaults chosen to
 *    be safely short, not platform-documented numbers.
 */
export type FreeStatus = 'free' | 'freemium' | 'paid' | 'unknown';
export type SubmissionMethod = 'web_form' | 'account_dashboard' | 'manual_post' | 'pull_request' | 'package_registry' | 'email' | 'api_authorized';

export type DirectorySeed = {
  slug: string;
  name: string;
  officialUrl: string;
  submissionUrl: string | null;
  category: string;
  audience: string;
  geography: string;
  freeSubmission: FreeStatus;
  accountRequired: boolean;
  approvalRequired: boolean;
  submissionMethod: SubmissionMethod;
  eligibility: Record<string, unknown>;
  restrictions?: string;
  presets: string[];
  priority: 'high' | 'medium' | 'low';
  fieldLimits: Record<string, number | string>;
  verificationSource: string;
  notes?: string;
};

const CONSERVATIVE = { _source: 'conservative_default' } as const;

export const DIRECTORY_SEEDS: DirectorySeed[] = [
  // ---------------------------------------------------------- launch platforms
  {
    slug: 'product-hunt', name: 'Product Hunt', officialUrl: 'https://www.producthunt.com',
    submissionUrl: 'https://www.producthunt.com/posts/new', category: 'startup_launch',
    audience: 'Early adopters, founders, investors', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: false, submissionMethod: 'account_dashboard',
    eligibility: { productMustBeUsable: true, ownerOrMakerOnly: false },
    restrictions: 'Soliciting, buying or coordinating upvotes violates Product Hunt policy and gets launches removed. LaunchOS prepares assets only.',
    presets: ['saas', 'mobile_app', 'dev_tool', 'open_source', 'ecommerce', 'education'], priority: 'high',
    fieldLimits: { name: 40, tagline: 60, description: 260, ...CONSERVATIVE },
    verificationSource: 'Confirm the current launch flow and field limits in the Product Hunt launch form itself.',
  },
  {
    slug: 'hacker-news-show', name: 'Hacker News (Show HN)', officialUrl: 'https://news.ycombinator.com',
    submissionUrl: 'https://news.ycombinator.com/submit', category: 'startup_launch',
    audience: 'Technical readers, engineers, founders', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: false, submissionMethod: 'manual_post',
    eligibility: { mustBeOwnWork: true, mustBeTryable: true, noMarketingCopy: true },
    restrictions: 'Show HN requires something people can actually try, written in your own words. Vote coordination is a bannable offence. LaunchOS never drafts or posts the submission for you — it prepares factual notes only.',
    presets: ['dev_tool', 'open_source', 'saas'], priority: 'medium',
    fieldLimits: { title: 80, ...CONSERVATIVE },
    verificationSource: 'Read the Show HN rules at https://news.ycombinator.com/showhn.html before posting.',
  },
  {
    slug: 'indie-hackers', name: 'Indie Hackers', officialUrl: 'https://www.indiehackers.com',
    submissionUrl: 'https://www.indiehackers.com/products', category: 'startup_launch',
    audience: 'Indie founders and bootstrappers', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: false, submissionMethod: 'account_dashboard',
    eligibility: { founderAccount: true }, presets: ['saas', 'dev_tool', 'mobile_app', 'ecommerce'],
    priority: 'medium', fieldLimits: { name: 40, tagline: 80, description: 600, ...CONSERVATIVE },
    verificationSource: 'Confirm the product-submission path from your Indie Hackers account.',
  },
  {
    slug: 'betalist', name: 'BetaList', officialUrl: 'https://betalist.com',
    submissionUrl: 'https://betalist.com/submit', category: 'startup_launch',
    audience: 'Early adopters looking for pre-launch products', geography: 'global', freeSubmission: 'freemium',
    accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { earlyStage: true },
    restrictions: 'A free queue and a paid expedited option have both existed historically. Confirm which applies before submitting.',
    presets: ['saas', 'mobile_app', 'dev_tool'], priority: 'low',
    fieldLimits: { name: 40, tagline: 60, description: 300, ...CONSERVATIVE },
    verificationSource: 'Check the submission page for the current free vs paid options.',
  },
  {
    slug: 'peerlist-launchpad', name: 'Peerlist', officialUrl: 'https://peerlist.io',
    submissionUrl: null, category: 'startup_launch', audience: 'Developers and designers; strong India presence',
    geography: 'global', freeSubmission: 'unknown', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { profileRequired: true },
    presets: ['saas', 'dev_tool', 'open_source'], priority: 'medium',
    fieldLimits: { name: 40, tagline: 80, description: 400, ...CONSERVATIVE },
    verificationSource: 'Find the current launch/project submission path from your Peerlist account and record it.',
  },
  {
    slug: 'uneed', name: 'Uneed', officialUrl: 'https://www.uneed.best',
    submissionUrl: null, category: 'startup_launch', audience: 'Product hunters and makers',
    geography: 'global', freeSubmission: 'unknown', accountRequired: true, approvalRequired: true,
    submissionMethod: 'web_form', eligibility: {}, presets: ['saas', 'dev_tool', 'mobile_app'],
    priority: 'low', fieldLimits: { name: 40, tagline: 60, description: 300, ...CONSERVATIVE },
    verificationSource: 'Confirm whether a free submission tier currently exists before spending time on assets.',
  },

  // ---------------------------------------------------------- software directories
  {
    slug: 'alternativeto', name: 'AlternativeTo', officialUrl: 'https://alternativeto.net',
    submissionUrl: 'https://alternativeto.net/manage/app/new/', category: 'software_directory',
    audience: 'People searching for alternatives to a known product', geography: 'global',
    freeSubmission: 'free', accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { publiclyAvailableProduct: true },
    presets: ['saas', 'dev_tool', 'mobile_app', 'open_source'], priority: 'high',
    fieldLimits: { name: 60, shortDescription: 200, longDescription: 1000, ...CONSERVATIVE },
    notes: 'High value for GEO: "alternatives to X" is one of the most common AI-assistant prompts.',
    verificationSource: 'Confirm the add-application path while signed in.',
  },
  {
    slug: 'saashub', name: 'SaaSHub', officialUrl: 'https://www.saashub.com',
    submissionUrl: 'https://www.saashub.com/submit', category: 'saas_discovery',
    audience: 'Software buyers comparing tools', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { liveProduct: true }, presets: ['saas', 'dev_tool'], priority: 'medium',
    fieldLimits: { name: 60, tagline: 120, description: 800, ...CONSERVATIVE },
    verificationSource: 'Confirm the submission page is reachable and free.',
  },
  {
    slug: 'stackshare', name: 'StackShare', officialUrl: 'https://stackshare.io',
    submissionUrl: null, category: 'dev_tool_directory', audience: 'Engineers choosing a stack',
    geography: 'global', freeSubmission: 'unknown', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { developerFacingTool: true },
    presets: ['dev_tool', 'open_source', 'saas'], priority: 'medium',
    fieldLimits: { name: 50, tagline: 120, description: 600, ...CONSERVATIVE },
    verificationSource: 'Locate the current "add a tool" flow and record its URL.',
  },
  {
    slug: 'g2', name: 'G2', officialUrl: 'https://www.g2.com',
    submissionUrl: 'https://sell.g2.com', category: 'business_software',
    audience: 'B2B software buyers', geography: 'global', freeSubmission: 'freemium',
    accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { businessSoftware: true, companyEmailRequired: true },
    restrictions: 'A free vendor profile exists; premium placement is paid. Incentivising reviews must follow G2 policy, and fabricating reviews is never acceptable.',
    presets: ['saas', 'dev_tool'], priority: 'medium',
    fieldLimits: { name: 60, tagline: 120, description: 1500, ...CONSERVATIVE },
    verificationSource: 'Confirm what the free vendor tier includes before investing effort.',
  },
  {
    slug: 'capterra', name: 'Capterra', officialUrl: 'https://www.capterra.com',
    submissionUrl: null, category: 'business_software', audience: 'SMB software buyers',
    geography: 'global', freeSubmission: 'freemium', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { businessSoftware: true },
    restrictions: 'Part of Gartner Digital Markets; a free listing with paid pay-per-click upgrades. Vendor onboarding path changes — verify it.',
    presets: ['saas'], priority: 'low', fieldLimits: { name: 60, description: 1500, ...CONSERVATIVE },
    verificationSource: 'Find the current vendor sign-up path from the Capterra site itself.',
  },
  {
    slug: 'getapp', name: 'GetApp', officialUrl: 'https://www.getapp.com',
    submissionUrl: null, category: 'business_software', audience: 'Business software buyers',
    geography: 'global', freeSubmission: 'freemium', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { businessSoftware: true },
    presets: ['saas'], priority: 'low', fieldLimits: { name: 60, description: 1500, ...CONSERVATIVE },
    verificationSource: 'Same vendor portal family as Capterra; confirm the current path.',
  },
  {
    slug: 'crunchbase', name: 'Crunchbase', officialUrl: 'https://www.crunchbase.com',
    submissionUrl: 'https://www.crunchbase.com/add-new', category: 'startup_launch',
    audience: 'Investors, journalists, researchers', geography: 'global', freeSubmission: 'freemium',
    accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { realCompany: true },
    restrictions: 'Only submit factual company data. Funding and headcount figures must be accurate.',
    presets: ['saas', 'mobile_app', 'dev_tool', 'ecommerce', 'agency'], priority: 'medium',
    fieldLimits: { name: 60, shortDescription: 240, longDescription: 1500, ...CONSERVATIVE },
    notes: 'Useful for brand-entity consistency: it is widely syndicated.',
    verificationSource: 'Confirm the add-company flow and what the free tier allows.',
  },

  // ---------------------------------------------------------- AI product directories
  {
    slug: 'theresanaiforthat', name: "There's An AI For That", officialUrl: 'https://theresanaiforthat.com',
    submissionUrl: null, category: 'ai_product', audience: 'People looking for an AI tool for a task',
    geography: 'global', freeSubmission: 'unknown', accountRequired: true, approvalRequired: true,
    submissionMethod: 'web_form', eligibility: { aiProduct: true },
    restrictions: 'Submission tiers on AI directories change often and free queues are frequently slow or withdrawn. Verify before committing effort.',
    presets: ['saas', 'dev_tool', 'mobile_app'], priority: 'low',
    fieldLimits: { name: 50, tagline: 80, description: 400, ...CONSERVATIVE },
    verificationSource: 'Check the submit page for current pricing; do not assume a free tier exists.',
  },
  {
    slug: 'futurepedia', name: 'Futurepedia', officialUrl: 'https://www.futurepedia.io',
    submissionUrl: null, category: 'ai_product', audience: 'AI tool shoppers', geography: 'global',
    freeSubmission: 'unknown', accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { aiProduct: true }, presets: ['saas', 'mobile_app'], priority: 'low',
    fieldLimits: { name: 50, tagline: 80, description: 400, ...CONSERVATIVE },
    verificationSource: 'Verify the current submission cost before preparing assets.',
  },

  // ---------------------------------------------------------- open source / dev
  {
    slug: 'github-repo', name: 'GitHub repository', officialUrl: 'https://github.com',
    submissionUrl: 'https://github.com/new', category: 'open_source_directory',
    audience: 'Developers', geography: 'global', freeSubmission: 'free', accountRequired: true,
    approvalRequired: false, submissionMethod: 'account_dashboard',
    eligibility: { codeOrDocsToPublish: true },
    restrictions: 'Never publish private source, secrets or customer data in a public repository.',
    presets: ['dev_tool', 'open_source', 'saas'], priority: 'high',
    fieldLimits: { description: 350, topics: 20 },
    notes: 'Repository description is limited to 350 characters and a repo can carry at most 20 topics.',
    verificationSource: 'GitHub repository settings page.',
  },
  {
    slug: 'awesome-list', name: 'Awesome list (topic curated list)', officialUrl: 'https://github.com/sindresorhus/awesome',
    submissionUrl: null, category: 'community_showcase', audience: 'Developers browsing a topic',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: true,
    submissionMethod: 'pull_request',
    eligibility: { mustFitListScope: true, maintainedProject: true },
    restrictions: 'Each list has its own contribution guidelines. A low-effort PR adding your own project is usually rejected and is bad manners.',
    presets: ['dev_tool', 'open_source'], priority: 'medium',
    fieldLimits: { entryDescription: 100, ...CONSERVATIVE },
    verificationSource: 'Find the specific awesome-* list for your topic and read its CONTRIBUTING file.',
  },
  {
    slug: 'npm-registry', name: 'npm registry', officialUrl: 'https://www.npmjs.com',
    submissionUrl: null, category: 'package_registry', audience: 'JavaScript and TypeScript developers',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: false,
    submissionMethod: 'package_registry', eligibility: { publishableNodePackage: true },
    presets: ['dev_tool', 'open_source'], priority: 'high',
    fieldLimits: { name: 214, description: 250, keywords: 20 },
    notes: 'Package names are limited to 214 characters. README content drives the package page.',
    verificationSource: 'npm publish documentation.',
  },
  {
    slug: 'pypi', name: 'PyPI', officialUrl: 'https://pypi.org',
    submissionUrl: null, category: 'package_registry', audience: 'Python developers',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: false,
    submissionMethod: 'package_registry', eligibility: { publishablePythonPackage: true },
    presets: ['dev_tool', 'open_source'], priority: 'medium',
    fieldLimits: { summary: 200, ...CONSERVATIVE },
    verificationSource: 'PyPI packaging guide.',
  },
  {
    slug: 'libraries-io', name: 'Libraries.io', officialUrl: 'https://libraries.io',
    submissionUrl: null, category: 'open_source_directory', audience: 'Developers assessing dependencies',
    geography: 'global', freeSubmission: 'free', accountRequired: false, approvalRequired: false,
    submissionMethod: 'package_registry',
    eligibility: { alreadyOnAPackageRegistry: true },
    notes: 'Indexes package registries automatically. No submission needed — publish to npm/PyPI and the listing follows.',
    presets: ['dev_tool', 'open_source'], priority: 'low', fieldLimits: {},
    verificationSource: 'Search for your package after publishing to confirm it was indexed.',
  },
  {
    slug: 'dev-to', name: 'DEV Community', officialUrl: 'https://dev.to',
    submissionUrl: 'https://dev.to/new', category: 'developer_publishing',
    audience: 'Developers reading tutorials', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: false, submissionMethod: 'account_dashboard',
    eligibility: { originalArticle: true },
    restrictions: 'A publishing platform, not a directory. Pure product promotion performs badly and may be flagged; publish something useful.',
    presets: ['dev_tool', 'open_source', 'saas'], priority: 'medium',
    fieldLimits: { title: 128, tags: 4, ...CONSERVATIVE },
    verificationSource: 'DEV editor shows live limits as you type.',
  },
  {
    slug: 'hashnode', name: 'Hashnode', officialUrl: 'https://hashnode.com',
    submissionUrl: null, category: 'developer_publishing', audience: 'Developers',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: false,
    submissionMethod: 'account_dashboard', eligibility: { originalArticle: true },
    presets: ['dev_tool', 'open_source', 'saas'], priority: 'low',
    fieldLimits: { title: 120, tags: 5, ...CONSERVATIVE },
    verificationSource: 'Hashnode editor.',
  },

  // ---------------------------------------------------------- app discovery
  {
    slug: 'apple-app-store', name: 'Apple App Store', officialUrl: 'https://developer.apple.com/app-store/',
    submissionUrl: 'https://appstoreconnect.apple.com', category: 'app_discovery',
    audience: 'iOS users', geography: 'global', freeSubmission: 'paid',
    accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { appleDeveloperProgramMembership: true, appReviewApproval: true },
    restrictions: 'The Apple Developer Program charges an annual fee. LaunchOS prepares the listing copy for free but cannot publish an app, and never claims an app is live without store approval.',
    presets: ['mobile_app'], priority: 'high',
    fieldLimits: { appName: 30, subtitle: 30, promotionalText: 170, description: 4000, keywords: 100 },
    notes: 'These App Store Connect limits are long-standing: name 30, subtitle 30, keyword field 100 characters.',
    verificationSource: 'App Store Connect help, "Reference: App information".',
  },
  {
    slug: 'google-play', name: 'Google Play', officialUrl: 'https://play.google.com/console/about/',
    submissionUrl: 'https://play.google.com/console', category: 'app_discovery',
    audience: 'Android users', geography: 'global', freeSubmission: 'paid',
    accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { playDeveloperAccount: true, policyReview: true },
    restrictions: 'A one-time Google Play developer registration fee applies. Planning is free in LaunchOS; publication is not.',
    presets: ['mobile_app'], priority: 'high',
    fieldLimits: { title: 30, shortDescription: 80, fullDescription: 4000 },
    notes: 'Play Console limits: title 30, short description 80, full description 4000 characters.',
    verificationSource: 'Play Console help, "Set up your app\'s store listing".',
  },
  {
    slug: 'f-droid', name: 'F-Droid', officialUrl: 'https://f-droid.org',
    submissionUrl: null, category: 'app_discovery', audience: 'Android users who want FOSS apps',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: true,
    submissionMethod: 'pull_request',
    eligibility: { fullyFreeSoftware: true, reproducibleBuild: 'preferred' },
    restrictions: 'Only accepts apps whose source is free software with no proprietary dependencies.',
    presets: ['mobile_app', 'open_source'], priority: 'low',
    fieldLimits: { summary: 80, description: 4000, ...CONSERVATIVE },
    verificationSource: 'F-Droid inclusion policy and the fdroiddata contribution docs.',
  },

  // ---------------------------------------------------------- local / business
  {
    slug: 'google-business-profile', name: 'Google Business Profile', officialUrl: 'https://www.google.com/business/',
    submissionUrl: 'https://business.google.com', category: 'local_listing',
    audience: 'People searching locally on Google Search and Maps', geography: 'global',
    freeSubmission: 'free', accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: {
      inPersonCustomerContact: true,
      physicalAddressOrServiceArea: true,
      onlineOnlyBusinessesNotEligible: true,
    },
    restrictions:
      'Google requires that the business makes in-person contact with customers during its stated hours. An online-only SaaS product does NOT qualify. Creating a fake address is a guideline violation and can get the profile suspended.',
    presets: ['local_business', 'agency', 'ecommerce', 'nonprofit'], priority: 'high',
    fieldLimits: { businessName: 'use the real-world name only', description: 750 },
    notes: 'Business description is limited to 750 characters. The name field must match real-world signage; keyword stuffing it is a violation.',
    verificationSource: 'Google Business Profile guidelines for representing your business.',
  },
  {
    slug: 'bing-places', name: 'Bing Places for Business', officialUrl: 'https://www.bingplaces.com',
    submissionUrl: 'https://www.bingplaces.com', category: 'local_listing',
    audience: 'People searching locally on Bing and Copilot', geography: 'global',
    freeSubmission: 'free', accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { physicalOrServiceAreaBusiness: true },
    presets: ['local_business', 'agency'], priority: 'medium',
    fieldLimits: { description: 500, ...CONSERVATIVE },
    notes: 'Supports importing an existing Google Business Profile, which saves re-entry.',
    verificationSource: 'Bing Places onboarding flow.',
  },
  {
    slug: 'apple-business-connect', name: 'Apple Business Connect', officialUrl: 'https://businessconnect.apple.com',
    submissionUrl: 'https://businessconnect.apple.com', category: 'local_listing',
    audience: 'Apple Maps and Siri users', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { physicalLocationOrServiceArea: true }, presets: ['local_business', 'agency'],
    priority: 'medium', fieldLimits: { ...CONSERVATIVE }, verificationSource: 'Apple Business Connect onboarding.',
  },
  {
    slug: 'justdial', name: 'Justdial', officialUrl: 'https://www.justdial.com',
    submissionUrl: 'https://free-listing.justdial.com', category: 'local_listing',
    audience: 'Indian consumers searching for local services', geography: 'IN',
    freeSubmission: 'freemium', accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { indianBusiness: true, phoneVerification: true },
    restrictions: 'A free listing tier exists alongside heavily sold paid placements. Expect sales calls after listing.',
    presets: ['local_business', 'agency', 'ecommerce'], priority: 'medium',
    fieldLimits: { ...CONSERVATIVE }, verificationSource: 'Justdial free-listing page.',
  },
  {
    slug: 'indiamart', name: 'IndiaMART', officialUrl: 'https://www.indiamart.com',
    submissionUrl: null, category: 'local_listing', audience: 'Indian B2B buyers',
    geography: 'IN', freeSubmission: 'freemium', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { indianSellerOrSupplier: true },
    presets: ['ecommerce', 'local_business'], priority: 'low', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'IndiaMART seller onboarding.',
  },
  {
    slug: 'yelp', name: 'Yelp', officialUrl: 'https://biz.yelp.com',
    submissionUrl: 'https://biz.yelp.com/signup', category: 'local_listing',
    audience: 'Consumers reading local reviews', geography: 'US, CA, UK, and selected markets',
    freeSubmission: 'free', accountRequired: true, approvalRequired: true, submissionMethod: 'web_form',
    eligibility: { physicalOrServiceAreaBusiness: true, marketSupported: true },
    restrictions: 'Yelp explicitly prohibits asking customers for reviews. Do not run a review-request campaign here.',
    presets: ['local_business'], priority: 'low', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'Yelp business onboarding and content guidelines.',
  },

  // ---------------------------------------------------------- shopping
  {
    slug: 'google-merchant-center', name: 'Google Merchant Center', officialUrl: 'https://www.google.com/retail/solutions/merchant-center/',
    submissionUrl: 'https://merchants.google.com', category: 'shopping',
    audience: 'Shoppers on Google Search and Shopping surfaces', geography: 'global',
    freeSubmission: 'free', accountRequired: true, approvalRequired: true, submissionMethod: 'account_dashboard',
    eligibility: { sellsPhysicalOrDigitalProducts: true, policyCompliantSite: true, productFeed: true },
    restrictions: 'Free product listings exist separately from paid Shopping ads. LaunchOS only helps with the free listings path.',
    presets: ['ecommerce'], priority: 'high',
    fieldLimits: { productTitle: 150, productDescription: 5000 },
    notes: 'Product feed specification allows a 150-character title and 5000-character description.',
    verificationSource: 'Google Merchant Center product data specification.',
  },

  // ---------------------------------------------------------- professional services
  {
    slug: 'clutch', name: 'Clutch', officialUrl: 'https://clutch.co',
    submissionUrl: null, category: 'professional_service', audience: 'Buyers of agency and dev services',
    geography: 'global', freeSubmission: 'freemium', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { serviceBusiness: true, clientReferencesHelpful: true },
    restrictions: 'Reviews are collected by Clutch directly from your clients. Never submit a review on a client\'s behalf.',
    presets: ['agency'], priority: 'medium', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'Clutch "get listed" flow.',
  },
  {
    slug: 'goodfirms', name: 'GoodFirms', officialUrl: 'https://www.goodfirms.co',
    submissionUrl: null, category: 'professional_service', audience: 'Service buyers',
    geography: 'global', freeSubmission: 'freemium', accountRequired: true, approvalRequired: true,
    submissionMethod: 'web_form', eligibility: { serviceBusiness: true },
    presets: ['agency'], priority: 'low', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'GoodFirms company listing flow.',
  },
  {
    slug: 'linkedin-company-page', name: 'LinkedIn company page', officialUrl: 'https://www.linkedin.com/company/setup/new/',
    submissionUrl: 'https://www.linkedin.com/company/setup/new/', category: 'professional_service',
    audience: 'Professional audiences and recruiters', geography: 'global', freeSubmission: 'free',
    accountRequired: true, approvalRequired: false, submissionMethod: 'account_dashboard',
    eligibility: { personalLinkedInAccount: true, companyEmailDomainHelpful: true },
    presets: ['saas', 'dev_tool', 'agency', 'ecommerce', 'nonprofit', 'education', 'local_business'],
    priority: 'high', fieldLimits: { tagline: 120, description: 2000 },
    notes: 'Tagline 120 characters, description up to 2000. A page is also a strong brand-entity signal.',
    verificationSource: 'LinkedIn page setup form.',
  },

  // ---------------------------------------------------------- nonprofit
  {
    slug: 'candid-guidestar', name: 'Candid (GuideStar) nonprofit profile', officialUrl: 'https://www.guidestar.org',
    submissionUrl: null, category: 'nonprofit_listing', audience: 'Donors, grantmakers, researchers',
    geography: 'US primarily', freeSubmission: 'free', accountRequired: true, approvalRequired: true,
    submissionMethod: 'account_dashboard', eligibility: { registeredNonprofit: true, usIrsRecognitionForUsProfiles: true },
    presets: ['nonprofit'], priority: 'high', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'Candid nonprofit profile claim flow.',
  },
  {
    slug: 'ngo-darpan', name: 'NGO Darpan (NITI Aayog)', officialUrl: 'https://ngodarpan.gov.in',
    submissionUrl: null, category: 'nonprofit_listing', audience: 'Indian government bodies and grantmakers',
    geography: 'IN', freeSubmission: 'free', accountRequired: true, approvalRequired: true,
    submissionMethod: 'web_form',
    eligibility: { registeredIndianNgo: true, darpanIdRequiresRegistrationDocuments: true },
    restrictions: 'Government portal: only register an organisation you are legally authorised to represent.',
    presets: ['nonprofit'], priority: 'medium', fieldLimits: { ...CONSERVATIVE },
    verificationSource: 'NGO Darpan registration instructions.',
  },

  // ---------------------------------------------------------- communities (tracked, not spammed)
  {
    slug: 'reddit-relevant-subreddit', name: 'Reddit (relevant subreddit)', officialUrl: 'https://www.reddit.com',
    submissionUrl: null, category: 'community_showcase', audience: 'Topic-specific communities',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: false,
    submissionMethod: 'manual_post',
    eligibility: { subredditRulesPermitSelfPromotion: 'must_be_checked_per_subreddit', accountHistory: 'often_required' },
    restrictions:
      'Most subreddits restrict or ban self-promotion and many require account age or karma. LaunchOS will not post for you and will not generate promotional replies. Read the rules of the specific subreddit, record them, and participate as yourself.',
    presets: ['saas', 'dev_tool', 'open_source', 'mobile_app', 'ecommerce', 'local_business'],
    priority: 'low', fieldLimits: { title: 300 },
    notes: 'Reddit post titles are capped at 300 characters.',
    verificationSource: 'The specific subreddit sidebar and wiki rules.',
  },
  {
    slug: 'lobsters', name: 'Lobsters', officialUrl: 'https://lobste.rs',
    submissionUrl: null, category: 'community_showcase', audience: 'Technical readers',
    geography: 'global', freeSubmission: 'free', accountRequired: true, approvalRequired: true,
    submissionMethod: 'manual_post',
    eligibility: { inviteOnlyAccount: true },
    restrictions: 'Accounts are invite-only and the community is strict about self-promotion. Do not plan a launch here unless you are already a member in good standing.',
    presets: ['dev_tool', 'open_source'], priority: 'low', fieldLimits: { title: 100, ...CONSERVATIVE },
    verificationSource: 'Lobsters about page.',
  },
];

export const DIRECTORY_CATEGORIES = [...new Set(DIRECTORY_SEEDS.map((d) => d.category))].sort();
