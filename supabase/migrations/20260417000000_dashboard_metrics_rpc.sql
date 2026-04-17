-- ─────────────────────────────────────────────────────────────────────────────
-- get_admin_dashboard_metrics(p_start_date date)
--
-- Returns a JSON object containing all metrics needed by the admin dashboard:
--   • pipeline snapshot  (no date filter — real-time state of the funnel)
--   • period metrics     (filtered to jobs whose job_date >= p_start_date)
--   • today's dispatches (job_date = CURRENT_DATE, active only)
--   • inventory summary  (healthy / low / out-of-stock counts)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(p_start_date date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_today date := CURRENT_DATE;

  -- pipeline snapshot (no date filter)
  v_pipeline_value       numeric := 0;
  v_pending_enquiries    int     := 0;

  -- period metrics (job_date >= p_start_date)
  v_revenue_collected    numeric := 0;
  v_pending_receivables  numeric := 0;
  v_completed_count      int     := 0;
  v_total_period_jobs    int     := 0;

  -- today count
  v_jobs_today_count     int     := 0;

  -- inventory
  v_healthy_stock        int     := 0;
  v_low_stock            int     := 0;
  v_out_of_stock         int     := 0;

  -- aggregation rows
  v_service_mix  jsonb;
  v_staff_perf   jsonb;
  v_todays_jobs  jsonb;
  v_inv_alerts   jsonb;
BEGIN
  -- ── Pipeline snapshot ───────────────────────────────────────────────────────
  SELECT
    COALESCE(SUM(CASE WHEN stage = 'Quotation Sent' AND (status IS NULL OR status = 'open')
                      THEN quoted_amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE stage = 'New Enquiry' AND (status IS NULL OR status = 'open'))
  INTO v_pipeline_value, v_pending_enquiries
  FROM public.jobs;

  -- ── Today's job count ───────────────────────────────────────────────────────
  SELECT COUNT(*) INTO v_jobs_today_count
  FROM public.jobs
  WHERE job_date = v_today;

  -- ── Period metrics ──────────────────────────────────────────────────────────
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN stage = 'Completed' AND payment_status = 'Paid'   THEN quoted_amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN stage = 'Completed' AND payment_status = 'Pending' THEN quoted_amount ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE stage = 'Completed')
  INTO v_total_period_jobs, v_revenue_collected, v_pending_receivables, v_completed_count
  FROM public.jobs
  WHERE job_date >= p_start_date;

  -- ── Service mix (period) ────────────────────────────────────────────────────
  SELECT jsonb_object_agg(service_type, cnt)
  INTO v_service_mix
  FROM (
    SELECT service_type, COUNT(*) AS cnt
    FROM public.jobs
    WHERE job_date >= p_start_date
      AND service_type IS NOT NULL
    GROUP BY service_type
  ) sm;

  -- ── Staff performance (period, completed jobs only) ─────────────────────────
  SELECT jsonb_object_agg(assigned_to, jsonb_build_object('count', cnt, 'revenue', rev))
  INTO v_staff_perf
  FROM (
    SELECT
      assigned_to,
      COUNT(*)             AS cnt,
      COALESCE(SUM(quoted_amount), 0) AS rev
    FROM public.jobs
    WHERE job_date >= p_start_date
      AND stage = 'Completed'
      AND assigned_to IS NOT NULL
    GROUP BY assigned_to
  ) sp;

  -- ── Today's active dispatches ────────────────────────────────────────────────
  SELECT jsonb_agg(jsonb_build_object(
    'id',           j.id,
    'stage',        j.stage,
    'service_type', j.service_type,
    'assigned_to',  j.assigned_to,
    'customer_name', c.name,
    'customer_address', c.address
  ))
  INTO v_todays_jobs
  FROM public.jobs j
  LEFT JOIN public.customers c ON c.id = j.customer_id
  WHERE j.job_date = v_today
    AND j.stage NOT IN ('Completed', 'Loss (Analysis)')
    AND (j.status IS NULL OR j.status = 'open');

  -- ── Inventory summary ───────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE stock_quantity > 5),
    COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity <= 5),
    COUNT(*) FILTER (WHERE stock_quantity = 0)
  INTO v_healthy_stock, v_low_stock, v_out_of_stock
  FROM public.inventory_items;

  -- ── Low/out-of-stock items for alert list ───────────────────────────────────
  SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'unit', unit, 'stock_quantity', stock_quantity)
                   ORDER BY stock_quantity ASC)
  INTO v_inv_alerts
  FROM public.inventory_items
  WHERE stock_quantity <= 5;

  -- ── Assemble and return ─────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'pipeline_value',      v_pipeline_value,
    'pending_enquiries',   v_pending_enquiries,
    'jobs_today_count',    v_jobs_today_count,
    'revenue_collected',   v_revenue_collected,
    'pending_receivables', v_pending_receivables,
    'completed_count',     v_completed_count,
    'total_period_jobs',   v_total_period_jobs,
    'service_mix',         COALESCE(v_service_mix, '{}'::jsonb),
    'staff_perf',          COALESCE(v_staff_perf,  '{}'::jsonb),
    'todays_jobs',         COALESCE(v_todays_jobs,  '[]'::jsonb),
    'healthy_stock',       v_healthy_stock,
    'low_stock',           v_low_stock,
    'out_of_stock',        v_out_of_stock,
    'inv_alerts',          COALESCE(v_inv_alerts,   '[]'::jsonb)
  );
END;
$$;

-- Grant execution to authenticated users (RLS still applies to underlying tables)
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(date) TO authenticated;
