-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes v2 — matching Phase 2 server-side filter predicates
-- ─────────────────────────────────────────────────────────────────────────────

-- Kanban / list view: stage + assigned_to + created_at (cursor pagination)
CREATE INDEX IF NOT EXISTS idx_jobs_stage_assigned_created
  ON public.jobs (stage, assigned_to, created_at DESC);

-- List view primary sort column
CREATE INDEX IF NOT EXISTS idx_jobs_created_at_id
  ON public.jobs (created_at DESC, id DESC);

-- Service-type filter + sort
CREATE INDEX IF NOT EXISTS idx_jobs_service_type_created
  ON public.jobs (service_type, created_at DESC);

-- job_date filter (dashboard today query, date-range filter)
CREATE INDEX IF NOT EXISTS idx_jobs_job_date
  ON public.jobs (job_date DESC);

-- visit_date filter (site-visit date range filter)
CREATE INDEX IF NOT EXISTS idx_jobs_visit_date
  ON public.jobs (visit_date DESC);

-- ── Full-text / trigram search ───────────────────────────────────────────────
-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on ac_brand (ILIKE search)
CREATE INDEX IF NOT EXISTS idx_jobs_ac_brand_trgm
  ON public.jobs USING gin (ac_brand gin_trgm_ops);

-- Trigram index on service_report_no (ILIKE search)
CREATE INDEX IF NOT EXISTS idx_jobs_service_report_trgm
  ON public.jobs USING gin (service_report_no gin_trgm_ops);

-- Trigram index on customer name (via customers table)
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON public.customers USING gin (name gin_trgm_ops);
