/**
 * Versioned, forward-only migrations.
 *
 * SQL is kept deliberately portable: TEXT / INTEGER / REAL columns, ISO-8601
 * timestamps as TEXT, text primary keys, no SQLite-only expressions. See
 * docs/ARCHITECTURE.md for the PostgreSQL mapping.
 */
export type Migration = { version: number; name: string; sql: string };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'core',
    sql: `
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      preset TEXT NOT NULL,
      category TEXT,
      website_url TEXT,
      country TEXT,
      market TEXT,
      launch_status TEXT NOT NULL DEFAULT 'pre_launch',
      owner TEXT,
      objectives TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (workspace_id, slug)
    );

    CREATE TABLE brand_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      brand_name TEXT NOT NULL,
      tagline TEXT,
      short_description TEXT,
      long_description TEXT,
      value_proposition TEXT,
      target_audience TEXT,
      problems_solved TEXT,
      features_json TEXT NOT NULL DEFAULT '[]',
      pricing_model TEXT,
      pricing_detail TEXT,
      languages_json TEXT NOT NULL DEFAULT '[]',
      brand_colors_json TEXT NOT NULL DEFAULT '[]',
      logo_path TEXT,
      contact_email TEXT,
      contact_public INTEGER NOT NULL DEFAULT 0,
      social_json TEXT NOT NULL DEFAULT '{}',
      github_url TEXT,
      app_store_url TEXT,
      play_store_url TEXT,
      verified_fields_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE project_domains (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      host TEXT NOT NULL,
      authorized INTEGER NOT NULL DEFAULT 0,
      authorization_note TEXT,
      verified_search_console INTEGER NOT NULL DEFAULT 0,
      verified_bing INTEGER NOT NULL DEFAULT 0,
      indexnow_key TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (project_id, host)
    );

    CREATE TABLE project_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      path_or_url TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE project_integrations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_configured',
      scope TEXT,
      note TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, provider)
    );

    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_audit_events_project ON audit_events(project_id, created_at);
    `,
  },
  {
    version: 2,
    name: 'audits',
    sql: `
    CREATE TABLE site_audits (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      start_url TEXT NOT NULL,
      status TEXT NOT NULL,
      robots_status TEXT,
      robots_txt TEXT,
      sitemap_urls_json TEXT NOT NULL DEFAULT '[]',
      pages_crawled INTEGER NOT NULL DEFAULT 0,
      pages_requested INTEGER NOT NULL DEFAULT 0,
      skipped_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX idx_site_audits_project ON site_audits(project_id, started_at);

    CREATE TABLE audit_pages (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL REFERENCES site_audits(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      final_url TEXT,
      status_code INTEGER,
      redirect_chain_json TEXT NOT NULL DEFAULT '[]',
      content_type TEXT,
      bytes INTEGER,
      elapsed_ms INTEGER,
      title TEXT,
      meta_description TEXT,
      canonical TEXT,
      meta_robots TEXT,
      h1_json TEXT NOT NULL DEFAULT '[]',
      heading_outline_json TEXT NOT NULL DEFAULT '[]',
      og_json TEXT NOT NULL DEFAULT '{}',
      twitter_json TEXT NOT NULL DEFAULT '{}',
      hreflang_json TEXT NOT NULL DEFAULT '[]',
      lang TEXT,
      viewport TEXT,
      word_count INTEGER,
      internal_links INTEGER,
      external_links INTEGER,
      images_total INTEGER,
      images_missing_alt INTEGER,
      jsonld_json TEXT NOT NULL DEFAULT '[]',
      depth INTEGER NOT NULL DEFAULT 0,
      from_sitemap INTEGER NOT NULL DEFAULT 0,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX idx_audit_pages_audit ON audit_pages(audit_id);

    CREATE TABLE audit_findings (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL REFERENCES site_audits(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      check_id TEXT NOT NULL,
      category TEXT NOT NULL,
      severity TEXT NOT NULL,
      page_url TEXT,
      title TEXT NOT NULL,
      evidence TEXT NOT NULL,
      impact_hypothesis TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      complexity TEXT NOT NULL,
      verification TEXT NOT NULL,
      docs_url TEXT,
      fix_snippet TEXT,
      fix_language TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_audit_findings_audit ON audit_findings(audit_id, severity);
    CREATE INDEX idx_audit_findings_project ON audit_findings(project_id);

    CREATE TABLE performance_results (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL REFERENCES site_audits(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      measurement_kind TEXT NOT NULL,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE structured_data_results (
      id TEXT PRIMARY KEY,
      audit_id TEXT NOT NULL REFERENCES site_audits(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      schema_type TEXT,
      valid INTEGER NOT NULL,
      problems_json TEXT NOT NULL DEFAULT '[]',
      raw TEXT,
      created_at TEXT NOT NULL
    );
    `,
  },
  {
    version: 3,
    name: 'seo_geo',
    sql: `
    CREATE TABLE keyword_opportunities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      keyword TEXT NOT NULL,
      intent TEXT NOT NULL,
      source TEXT NOT NULL,
      data_confidence TEXT NOT NULL,
      impressions INTEGER,
      clicks INTEGER,
      ctr REAL,
      position REAL,
      volume INTEGER,
      cluster_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (project_id, keyword)
    );
    CREATE INDEX idx_keywords_project ON keyword_opportunities(project_id);

    CREATE TABLE keyword_clusters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      intent TEXT NOT NULL,
      keyword_count INTEGER NOT NULL DEFAULT 0,
      target_page_type TEXT,
      target_url TEXT,
      rationale TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE content_pages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      url TEXT,
      page_type TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'proposed',
      cluster_id TEXT REFERENCES keyword_clusters(id) ON DELETE SET NULL,
      last_reviewed TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE seo_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_ref TEXT,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      area TEXT NOT NULL,
      severity TEXT NOT NULL,
      effort TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      verification TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_seo_tasks_project ON seo_tasks(project_id, status);

    CREATE TABLE content_briefs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      working_title TEXT NOT NULL,
      content_type TEXT NOT NULL,
      audience TEXT NOT NULL,
      search_intent TEXT NOT NULL,
      user_problem TEXT NOT NULL,
      outline_json TEXT NOT NULL DEFAULT '[]',
      source_material_json TEXT NOT NULL DEFAULT '[]',
      visuals_json TEXT NOT NULL DEFAULT '[]',
      internal_links_json TEXT NOT NULL DEFAULT '[]',
      cta TEXT,
      checklist_json TEXT NOT NULL DEFAULT '[]',
      cluster_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );

    CREATE TABLE search_performance_imports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT,
      row_count INTEGER NOT NULL,
      date_range TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE ai_search_queries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      intent TEXT NOT NULL,
      rationale TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE ai_visibility_observations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      query_id TEXT REFERENCES ai_search_queries(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      query_text TEXT NOT NULL,
      observed_on TEXT NOT NULL,
      brand_mentioned INTEGER NOT NULL,
      cited INTEGER NOT NULL DEFAULT 0,
      citation_urls_json TEXT NOT NULL DEFAULT '[]',
      evidence_kind TEXT NOT NULL,
      evidence_ref TEXT,
      notes TEXT,
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE entity_consistency_checks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      field TEXT NOT NULL,
      canonical_value TEXT,
      source_label TEXT NOT NULL,
      source_url TEXT,
      observed_value TEXT,
      status TEXT NOT NULL,
      checked_at TEXT NOT NULL
    );
    `,
  },
  {
    version: 4,
    name: 'listings_launch',
    sql: `
    CREATE TABLE directory_registry (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      official_url TEXT NOT NULL,
      submission_url TEXT,
      category TEXT NOT NULL,
      audience TEXT NOT NULL,
      geography TEXT NOT NULL,
      free_submission TEXT NOT NULL,
      account_required INTEGER NOT NULL DEFAULT 1,
      approval_required INTEGER NOT NULL DEFAULT 1,
      submission_method TEXT NOT NULL,
      eligibility_json TEXT NOT NULL DEFAULT '{}',
      restrictions TEXT,
      presets_json TEXT NOT NULL DEFAULT '[]',
      priority TEXT NOT NULL DEFAULT 'medium',
      field_limits_json TEXT NOT NULL DEFAULT '{}',
      verification_status TEXT NOT NULL,
      verification_source TEXT,
      last_verified TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE directory_eligibility (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      directory_id TEXT NOT NULL REFERENCES directory_registry(id) ON DELETE CASCADE,
      eligible TEXT NOT NULL,
      relevance INTEGER NOT NULL,
      reasons_json TEXT NOT NULL DEFAULT '[]',
      blockers_json TEXT NOT NULL DEFAULT '[]',
      evaluated_at TEXT NOT NULL,
      UNIQUE (project_id, directory_id)
    );

    CREATE TABLE listing_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      directory_id TEXT NOT NULL REFERENCES directory_registry(id) ON DELETE CASCADE,
      fields_json TEXT NOT NULL DEFAULT '{}',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      asset_checklist_json TEXT NOT NULL DEFAULT '[]',
      brand_revision INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'not_researched',
      approved_by TEXT,
      approved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, directory_id)
    );

    CREATE TABLE listing_submissions (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL REFERENCES listing_drafts(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      method TEXT NOT NULL,
      submitted_at TEXT,
      live_url TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE listing_evidence (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES listing_submissions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      reference TEXT NOT NULL,
      observed_on TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      verification_detail TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      template TEXT,
      objective TEXT NOT NULL,
      audience TEXT,
      region TEXT,
      starts_on TEXT,
      ends_on TEXT,
      channels_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'planned',
      outcome_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE content_assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      body TEXT,
      path TEXT,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE social_drafts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      format TEXT NOT NULL,
      body TEXT NOT NULL,
      char_count INTEGER NOT NULL,
      char_limit INTEGER,
      media_requirements_json TEXT NOT NULL DEFAULT '[]',
      warnings_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_for TEXT,
      published_evidence TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE publishing_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      ref_id TEXT,
      destination TEXT NOT NULL,
      instructions TEXT NOT NULL,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      approved_by TEXT,
      approved_at TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_approval',
      created_at TEXT NOT NULL
    );
    `,
  },
  {
    version: 5,
    name: 'growth_ops',
    sql: `
    CREATE TABLE outreach_prospects (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      organization TEXT NOT NULL,
      website TEXT,
      contact_channel TEXT,
      contact_basis TEXT NOT NULL,
      opportunity_type TEXT NOT NULL,
      relevance_reason TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'identified',
      outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE outreach_interactions (
      id TEXT PRIMARY KEY,
      prospect_id TEXT NOT NULL REFERENCES outreach_prospects(id) ON DELETE CASCADE,
      direction TEXT NOT NULL,
      channel TEXT NOT NULL,
      summary TEXT NOT NULL,
      draft_body TEXT,
      approved_by TEXT,
      approved_at TEXT,
      occurred_on TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE communities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT,
      kind TEXT NOT NULL,
      self_promotion_rules TEXT,
      rules_verified INTEGER NOT NULL DEFAULT 0,
      permitted_formats_json TEXT NOT NULL DEFAULT '[]',
      relevance_reason TEXT,
      status TEXT NOT NULL DEFAULT 'candidate',
      created_at TEXT NOT NULL
    );

    CREATE TABLE backlinks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_url TEXT NOT NULL,
      target_url TEXT NOT NULL,
      anchor TEXT,
      origin TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      last_checked TEXT,
      http_status INTEGER,
      link_present INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE utm_campaigns (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      base_url TEXT NOT NULL,
      utm_source TEXT NOT NULL,
      utm_medium TEXT NOT NULL,
      utm_campaign TEXT NOT NULL,
      utm_content TEXT,
      utm_term TEXT,
      final_url TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE analytics_imports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT,
      row_count INTEGER NOT NULL,
      note TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE TABLE traffic_metrics (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      import_id TEXT REFERENCES analytics_imports(id) ON DELETE CASCADE,
      data_origin TEXT NOT NULL,
      provider TEXT NOT NULL,
      metric_date TEXT,
      dimension TEXT NOT NULL,
      dimension_value TEXT NOT NULL,
      impressions INTEGER,
      clicks INTEGER,
      ctr REAL,
      position REAL,
      sessions INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_traffic_project ON traffic_metrics(project_id, dimension, metric_date);

    CREATE TABLE conversion_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      data_origin TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      count INTEGER NOT NULL,
      source TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE growth_experiments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      hypothesis TEXT NOT NULL,
      change_description TEXT NOT NULL,
      target_metric TEXT NOT NULL,
      starts_on TEXT,
      ends_on TEXT,
      baseline_value REAL,
      observed_value REAL,
      sample_baseline INTEGER,
      sample_variant INTEGER,
      conversions_baseline INTEGER,
      conversions_variant INTEGER,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      decision TEXT,
      followup TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE referral_programs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      incentive TEXT NOT NULL,
      disclosure TEXT NOT NULL,
      terms_url TEXT,
      landing_copy TEXT,
      tracking_param TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL
    );

    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      detail TEXT,
      area TEXT NOT NULL,
      kind TEXT NOT NULL,
      priority_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      requires_approval INTEGER NOT NULL DEFAULT 0,
      due_on TEXT,
      source TEXT,
      source_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_tasks_project ON tasks(project_id, status);

    CREATE TABLE task_approvals (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      decision TEXT NOT NULL,
      decided_by TEXT NOT NULL,
      note TEXT,
      decided_at TEXT NOT NULL
    );

    CREATE TABLE automation_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      job TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      summary TEXT,
      log TEXT,
      idempotency_key TEXT
    );
    CREATE UNIQUE INDEX idx_automation_idem ON automation_runs(idempotency_key);

    CREATE TABLE generated_reports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      format TEXT NOT NULL,
      path TEXT,
      body TEXT,
      generated_at TEXT NOT NULL
    );

    CREATE TABLE tool_registry (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      capability TEXT NOT NULL,
      pricing TEXT NOT NULL,
      free_limits TEXT,
      account_required INTEGER NOT NULL DEFAULT 0,
      privacy_note TEXT,
      last_verified TEXT,
      verification_status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    `,
  },
  {
    version: 6,
    name: 'aso_local',
    sql: `
    CREATE TABLE aso_listings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      store TEXT NOT NULL,
      app_title TEXT,
      subtitle TEXT,
      short_description TEXT,
      long_description TEXT,
      keyword_field TEXT,
      category TEXT,
      release_notes TEXT,
      locales_json TEXT NOT NULL DEFAULT '[]',
      findings_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, store)
    );

    CREATE TABLE local_profiles (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      street TEXT,
      city TEXT,
      region TEXT,
      postal_code TEXT,
      country TEXT,
      phone TEXT,
      hours_json TEXT NOT NULL DEFAULT '{}',
      service_areas_json TEXT NOT NULL DEFAULT '[]',
      serves_customers_in_person INTEGER NOT NULL DEFAULT 0,
      gbp_eligibility TEXT NOT NULL DEFAULT 'unknown',
      gbp_eligibility_reason TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id)
    );
    `,
  },
];
