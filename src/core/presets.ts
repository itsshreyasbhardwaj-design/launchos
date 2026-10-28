/**
 * Growth presets. A preset changes which channels, directories and checks are
 * prioritized for a project — a local bakery and a developer CLI must not get
 * the same plan.
 */
export type PresetId = 'saas' | 'mobile_app' | 'dev_tool' | 'local_business' | 'ecommerce' | 'agency' | 'nonprofit' | 'open_source' | 'education' | 'other';

export type Preset = {
  id: PresetId;
  label: string;
  description: string;
  /** Directory categories ranked most to least relevant. */
  directoryCategories: string[];
  socialPlatforms: string[];
  contentTypes: string[];
  launchPlaybooks: string[];
  seoFocus: string[];
  /** Modules the dashboard surfaces for this preset. */
  modules: string[];
  requiresPhysicalLocation: boolean;
};

export const PRESETS: Record<PresetId, Preset> = {
  saas: {
    id: 'saas',
    label: 'SaaS application',
    description: 'Prioritizes software directories, launch communities, feature and comparison pages, and signup conversion.',
    directoryCategories: ['saas_discovery', 'software_directory', 'startup_launch', 'ai_product', 'business_software', 'productivity'],
    socialPlatforms: ['linkedin', 'x', 'threads', 'youtube'],
    contentTypes: ['use_case_page', 'comparison', 'tutorial', 'feature_article', 'original_research', 'faq'],
    launchPlaybooks: ['product_hunt', 'community_launch', 'feature_release'],
    seoFocus: ['commercial_investigation', 'problem_awareness', 'product_use_cases'],
    modules: ['audit', 'seo', 'geo', 'keywords', 'listings', 'launch', 'content', 'social', 'campaigns', 'outreach', 'analytics', 'experiments', 'cro'],
    requiresPhysicalLocation: false,
  },
  mobile_app: {
    id: 'mobile_app',
    label: 'Mobile app',
    description: 'Prioritizes app-store optimization, legitimate review collection, app directories and mobile landing performance.',
    directoryCategories: ['app_discovery', 'software_directory', 'startup_launch', 'productivity'],
    socialPlatforms: ['instagram', 'x', 'youtube', 'threads'],
    contentTypes: ['tutorial', 'feature_article', 'use_case_page', 'faq', 'release_notes'],
    launchPlaybooks: ['product_hunt', 'app_store_release', 'community_launch'],
    seoFocus: ['navigational_brand', 'problem_awareness', 'app_alternatives'],
    modules: ['audit', 'seo', 'geo', 'aso', 'listings', 'launch', 'content', 'social', 'campaigns', 'analytics', 'cro'],
    requiresPhysicalLocation: false,
  },
  dev_tool: {
    id: 'dev_tool',
    label: 'Developer tool',
    description: 'Prioritizes GitHub, documentation, tutorials, examples, integrations and developer communities.',
    directoryCategories: ['dev_tool_directory', 'open_source_directory', 'saas_discovery', 'startup_launch', 'ai_product'],
    socialPlatforms: ['x', 'linkedin', 'youtube'],
    contentTypes: ['technical_guide', 'tutorial', 'documentation', 'comparison', 'original_research', 'release_notes'],
    launchPlaybooks: ['show_hn', 'product_hunt', 'github_release', 'community_launch'],
    seoFocus: ['informational', 'problem_awareness', 'integration_queries'],
    modules: ['audit', 'seo', 'geo', 'keywords', 'listings', 'launch', 'github', 'content', 'social', 'communities', 'outreach', 'analytics'],
    requiresPhysicalLocation: false,
  },
  local_business: {
    id: 'local_business',
    label: 'Local business',
    description: 'Prioritizes eligible local listings, service pages, local search and genuine reviews.',
    directoryCategories: ['local_listing', 'professional_service', 'industry_directory'],
    socialPlatforms: ['instagram', 'facebook', 'linkedin'],
    contentTypes: ['service_page', 'faq', 'case_study', 'how_to'],
    launchPlaybooks: ['local_launch'],
    seoFocus: ['local_intent', 'service_queries', 'navigational_brand'],
    modules: ['audit', 'seo', 'local_seo', 'listings', 'content', 'social', 'reviews', 'analytics', 'cro'],
    requiresPhysicalLocation: true,
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'E-commerce',
    description: 'Prioritizes product data quality, structured data, shopping surfaces and merchant feeds.',
    directoryCategories: ['shopping', 'industry_directory', 'local_listing'],
    socialPlatforms: ['instagram', 'pinterest', 'facebook', 'x'],
    contentTypes: ['product_page', 'buying_guide', 'comparison', 'faq', 'how_to'],
    launchPlaybooks: ['product_release'],
    seoFocus: ['transactional', 'commercial_investigation', 'product_attributes'],
    modules: ['audit', 'seo', 'geo', 'listings', 'content', 'social', 'campaigns', 'analytics', 'cro'],
    requiresPhysicalLocation: false,
  },
  agency: {
    id: 'agency',
    label: 'Agency or consultancy',
    description: 'Prioritizes case studies, service pages, portfolio, professional networks and qualified inquiries.',
    directoryCategories: ['professional_service', 'industry_directory', 'local_listing'],
    socialPlatforms: ['linkedin', 'x', 'instagram'],
    contentTypes: ['case_study', 'service_page', 'original_research', 'industry_explainer'],
    launchPlaybooks: ['thought_leadership'],
    seoFocus: ['commercial_investigation', 'local_intent', 'industry_terms'],
    modules: ['audit', 'seo', 'geo', 'listings', 'content', 'social', 'outreach', 'analytics', 'cro'],
    requiresPhysicalLocation: false,
  },
  nonprofit: {
    id: 'nonprofit',
    label: 'Nonprofit',
    description: 'Prioritizes mission visibility, legitimate nonprofit listings, impact documentation and transparency.',
    directoryCategories: ['nonprofit_listing', 'industry_directory', 'local_listing'],
    socialPlatforms: ['instagram', 'linkedin', 'facebook'],
    contentTypes: ['impact_report', 'case_study', 'faq', 'how_to'],
    launchPlaybooks: ['campaign_launch'],
    seoFocus: ['informational', 'local_intent', 'cause_terms'],
    modules: ['audit', 'seo', 'geo', 'listings', 'content', 'social', 'outreach', 'analytics'],
    requiresPhysicalLocation: false,
  },
  open_source: {
    id: 'open_source',
    label: 'Open-source project',
    description: 'Prioritizes repository quality, docs, examples, open-source directories and contributor growth.',
    directoryCategories: ['open_source_directory', 'dev_tool_directory', 'startup_launch'],
    socialPlatforms: ['x', 'linkedin'],
    contentTypes: ['documentation', 'tutorial', 'technical_guide', 'release_notes'],
    launchPlaybooks: ['show_hn', 'github_release', 'community_launch'],
    seoFocus: ['informational', 'integration_queries'],
    modules: ['audit', 'seo', 'geo', 'listings', 'launch', 'github', 'content', 'communities', 'analytics'],
    requiresPhysicalLocation: false,
  },
  education: {
    id: 'education',
    label: 'Educational platform',
    description: 'Prioritizes curriculum content, course discovery, informational search and learner trust.',
    directoryCategories: ['industry_directory', 'saas_discovery', 'app_discovery'],
    socialPlatforms: ['youtube', 'linkedin', 'instagram'],
    contentTypes: ['tutorial', 'how_to', 'industry_explainer', 'faq'],
    launchPlaybooks: ['content_campaign'],
    seoFocus: ['informational', 'problem_awareness'],
    modules: ['audit', 'seo', 'geo', 'keywords', 'listings', 'content', 'social', 'analytics', 'cro'],
    requiresPhysicalLocation: false,
  },
  other: {
    id: 'other',
    label: 'Other',
    description: 'A conservative default: technical SEO, GEO basics and generic discovery surfaces only.',
    directoryCategories: ['industry_directory', 'startup_launch'],
    socialPlatforms: ['linkedin', 'x'],
    contentTypes: ['how_to', 'faq', 'industry_explainer'],
    launchPlaybooks: ['content_campaign'],
    seoFocus: ['informational'],
    modules: ['audit', 'seo', 'geo', 'listings', 'content', 'analytics'],
    requiresPhysicalLocation: false,
  },
};

export const PRESET_IDS = Object.keys(PRESETS) as PresetId[];
export const presetOf = (id: string): Preset => PRESETS[(id as PresetId)] ?? PRESETS.other;

/** Suggests a preset from signals the operator already gave us. Never silently applied. */
export function suggestPreset(input: { websiteUrl?: string; githubUrl?: string; appStoreUrl?: string; hasPhysicalLocation?: boolean; description?: string }): { preset: PresetId; reason: string } {
  const d = (input.description ?? '').toLowerCase();
  if (input.appStoreUrl) return { preset: 'mobile_app', reason: 'An app store URL was provided.' };
  if (input.hasPhysicalLocation) return { preset: 'local_business', reason: 'The business serves customers at a physical location.' };
  if (input.githubUrl && /\b(cli|sdk|library|api|framework|open.?source)\b/.test(d)) {
    return { preset: 'dev_tool', reason: 'A GitHub URL plus developer-tool vocabulary in the description.' };
  }
  if (input.githubUrl) return { preset: 'open_source', reason: 'A GitHub URL was provided and no commercial signals were given.' };
  if (/\b(shop|store|cart|checkout|product catalog)\b/.test(d)) return { preset: 'ecommerce', reason: 'Commerce vocabulary in the description.' };
  if (/\b(agency|consultanc|freelance|studio)\b/.test(d)) return { preset: 'agency', reason: 'Service-business vocabulary in the description.' };
  if (/\b(nonprofit|ngo|charity|foundation)\b/.test(d)) return { preset: 'nonprofit', reason: 'Nonprofit vocabulary in the description.' };
  if (/\b(course|learn|student|curriculum|school)\b/.test(d)) return { preset: 'education', reason: 'Education vocabulary in the description.' };
  if (input.websiteUrl) return { preset: 'saas', reason: 'A website URL with no other distinguishing signal; SaaS is the broadest software default.' };
  return { preset: 'other', reason: 'Not enough information to infer a category.' };
}
