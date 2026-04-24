import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import JobsClient from "./JobsClient";
import { JOB_STAGES, getStageDB } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Max jobs fetched per Kanban lane. */
const KANBAN_PER_STAGE = 40;
/** Jobs per page in list view (keyset pagination). */
const LIST_PAGE_SIZE = 50;

/**
 * Projected columns for the jobs list — avoids select('*') on a wide table.
 * Keep in sync with the Job type in JobsClient.tsx.
 */
const JOB_SELECT = [
  "id", "created_by", "assigned_to", "stage", "customer_id",
  "service_type", "ac_brand", "unit_count",
  "visit_date", "visit_time", "visit_phone",
  "job_date", "job_time",
  "second_visit_date", "second_visit_time",
  "payment_status", "notes", "labor_cost", "quoted_amount", "material_cost",
  "priority", "source", "service_report_no", "internal_notes",
  "quoted_date", "expiry_date", "status", "loss_reason", "closed_at",
  "created_at", "deposit_amount", "deposit_collected",
  "cv_redeemed", "cv_amount", "final_payment_collected",
  "quotation_breakdown", "quotation_materials", "quotation_warranty",
  "engineer_name", "visit_event_id", "job_event_id", "second_visit_event_id",
  "customers(id,name,phone,address,unit_type)",
].join(",");

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    service?: string;
    stage?: string;
    view?: string;
    cursor_created_at?: string;
    cursor_id?: string;
  }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const q       = params.q?.trim() || "";
  const service = params.service || "All";
  const stage   = params.stage   || "All";
  const view    = params.view    || "board";

  // ── Builds a Supabase query with all filters applied.
  function applyFilters(query: any) {
    if (service !== "All") query = query.eq("service_type", service);
    
    if (stage !== "All") {
      const dbStage = getStageDB(stage);
      query = query.eq("stage", dbStage);
    }

    // Text search: ac_brand / service_report_no / customer name (joined filter)
    if (q) {
      query = query.or(`ac_brand.ilike.%${q}%,service_report_no.ilike.%${q}%,customers.name.ilike.%${q}%`);
    }

    return query;
  }

  let initialJobs: any[] = [];
  let hasNextPage = false;
  let staffProfiles: { id: string; role: string; full_name?: string; email?: string }[] = [];

  // Parallelize Auth check, staff profiles, and jobs fetch
  const userPromise = supabase.auth.getUser();
  const profilesPromise = supabase
    .from("profiles")
    .select("id, role, full_name, name, email");

  if (view === "list") {
    const { cursor_created_at, cursor_id } = params;
    let query = applyFilters(
      supabase
        .from("jobs")
        .select(JOB_SELECT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(LIST_PAGE_SIZE + 1)
    );

    if (cursor_created_at && cursor_id) {
      query = query.or(`created_at.lt.${cursor_created_at},and(created_at.eq.${cursor_created_at},id.lt.${cursor_id})`);
    }

    const [userRes, profilesRes, jobsRes] = await Promise.all([userPromise, profilesPromise, query]);
    
    if (!userRes.data.user) redirect("/login");

    const rows = jobsRes.data || [];
    hasNextPage = rows.length > LIST_PAGE_SIZE;
    initialJobs = hasNextPage ? rows.slice(0, LIST_PAGE_SIZE) : rows;
    staffProfiles = (profilesRes.data || []).map((p: any) => ({ ...p, email: p.email || "" }));
  } else {
    // Pipeline view - we fetch active stages, but if a specific stage filter is active, we might narrow it down
    let activeStages = ["Site Visit Scheduled", "Quotation Sent", "Job Scheduled", "In Progress", "Second Visit", "Job Done (Payment Pending)"];
    
    // If a stage filter is active, only show that stage
    if (stage !== "All") {
      activeStages = [getStageDB(stage)];
    }

    const qActive = applyFilters(supabase.from("jobs").select(JOB_SELECT).in("stage", activeStages).order("created_at", { ascending: false }).limit(300));
    const qCompleted = stage === "All" || stage === "Completed" 
      ? applyFilters(supabase.from("jobs").select(JOB_SELECT).eq("stage", "Completed").order("created_at", { ascending: false }).limit(KANBAN_PER_STAGE))
      : null;

    const [userRes, profilesRes, activeRes, completedRes] = await Promise.all([
      userPromise, 
      profilesPromise, 
      qActive, 
      qCompleted || Promise.resolve({ data: [] })
    ]);

    if (!userRes.data.user) redirect("/login");

    const allActive = activeRes.data || [];
    const grouped: Record<string, any[]> = {};
    for (const job of allActive) {
      if (!grouped[job.stage]) grouped[job.stage] = [];
      if (grouped[job.stage].length < KANBAN_PER_STAGE) grouped[job.stage].push(job);
    }

    initialJobs = [...Object.values(grouped).flat(), ...(completedRes.data || [])];
    staffProfiles = (profilesRes.data || []).map((p: any) => ({ ...p, email: p.email || "" }));
  }

  const userId = (await userPromise).data.user?.id; // will be cached by now
  if (!userId) redirect("/login");


  // ── Cursor for next page (list view) ────────────────────────────────────────
  const lastJob = initialJobs[initialJobs.length - 1];
  const nextCursor =
    hasNextPage && lastJob
      ? { created_at: lastJob.created_at, id: lastJob.id }
      : null;

  return (
    <JobsClient
      initialJobs={initialJobs}
      userId={userId}
      role={"admin"}
      staffProfiles={staffProfiles}
      initialFilters={{ q, service, stage, view }}
      nextCursor={nextCursor}
    />
  );
}
