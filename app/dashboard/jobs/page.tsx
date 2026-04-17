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
    tech?: string;
    date_range?: string;
    view?: string;
    cursor_created_at?: string;
    cursor_id?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role: "admin" | "staff" = profile?.role ?? "staff";

  const params = await searchParams;
  const q          = params.q?.trim() || "";
  const service    = params.service    || "All";
  const tech       = params.tech       || "All";
  const date_range = params.date_range || "All";
  const view       = params.view       || "board";

  // ── If the user typed a search term that includes a customer name,
  //    resolve matching customer IDs first (uses trigram index).
  let customerIds: string[] | null = null;
  if (q) {
    const { data: matchedCustomers } = await supabase
      .from("customers")
      .select("id")
      .ilike("name", `%${q}%`);
    customerIds = (matchedCustomers || []).map((c: any) => c.id);
  }

  // ── Builds a Supabase query with all non-stage filters applied.
  function applyFilters(query: any) {
    if (service !== "All") query = query.eq("service_type", service);
    if (tech    !== "All") query = query.eq("assigned_to", tech);

    // Date range filter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];
    if (date_range === "Today") {
      query = query.or(`visit_date.eq.${todayStr},job_date.eq.${todayStr}`);
    } else if (date_range === "This Week") {
      const next7 = new Date(today);
      next7.setDate(today.getDate() + 7);
      const next7Str = next7.toISOString().split("T")[0];
      query = query.or(`and(visit_date.gte.${todayStr},visit_date.lte.${next7Str}),and(job_date.gte.${todayStr},job_date.lte.${next7Str})`);
    } else if (date_range === "This Month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const mStartStr  = monthStart.toISOString().split("T")[0];
      const mEndStr    = monthEnd.toISOString().split("T")[0];
      query = query.or(`and(visit_date.gte.${mStartStr},visit_date.lte.${mEndStr}),and(job_date.gte.${mStartStr},job_date.lte.${mEndStr})`);
    }

    // Text search: ac_brand / service_report_no / resolved customer IDs
    if (q) {
      const orParts = [`ac_brand.ilike.%${q}%`, `service_report_no.ilike.%${q}%`];
      if (customerIds && customerIds.length > 0) {
        orParts.push(`customer_id.in.(${customerIds.join(",")})`);
      }
      query = query.or(orParts.join(","));
    }

    return query;
  }

  let initialJobs: any[] = [];
  let hasNextPage = false;

  if (view === "list") {
    // ── LIST VIEW: keyset pagination ─────────────────────────────────────────
    const { cursor_created_at, cursor_id } = params;
    let query = supabase
      .from("jobs")
      .select(JOB_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIST_PAGE_SIZE + 1); // fetch +1 to detect next page

    query = applyFilters(query);

    // Apply keyset cursor
    if (cursor_created_at && cursor_id) {
      query = query.or(
        `created_at.lt.${cursor_created_at},and(created_at.eq.${cursor_created_at},id.lt.${cursor_id})`
      );
    }

    const { data } = await query;
    const rows = data || [];
    hasNextPage = rows.length > LIST_PAGE_SIZE;
    initialJobs = hasNextPage ? rows.slice(0, LIST_PAGE_SIZE) : rows;
  } else {
    // ── BOARD VIEW: parallel per-stage queries, 40 per lane ──────────────────
    const stageQueries = JOB_STAGES.map((displayStage) => {
      const dbStage = getStageDB(displayStage);
      let q_ = supabase
        .from("jobs")
        .select(JOB_SELECT)
        .eq("stage", dbStage)
        .order("created_at", { ascending: false })
        .limit(KANBAN_PER_STAGE);
      q_ = applyFilters(q_);
      return q_;
    });

    const results = await Promise.all(stageQueries);
    initialJobs = results.flatMap((r) => r.data || []);
  }

  // ── Staff profiles (admin only) ─────────────────────────────────────────────
  let staffProfiles: { id: string; role: string; full_name?: string; email?: string }[] = [];
  if (role === "admin") {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminClient();
    const { data: profiles } = await adminSupabase
      .from("profiles")
      .select("id, role, full_name, name");
    const { data: authData } = await adminSupabase.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    if (authData?.users) {
      authData.users.forEach((u) => emailMap.set(u.id, u.email ?? ""));
    }
    staffProfiles = (profiles || []).map((p: any) => ({
      ...p,
      email: emailMap.get(p.id) || "",
    }));
  }

  // ── Cursor for next page (list view) ────────────────────────────────────────
  const lastJob = initialJobs[initialJobs.length - 1];
  const nextCursor =
    hasNextPage && lastJob
      ? { created_at: lastJob.created_at, id: lastJob.id }
      : null;

  return (
    <JobsClient
      initialJobs={initialJobs}
      userId={user.id}
      role={role}
      staffProfiles={staffProfiles}
      initialFilters={{ q, service, tech, date_range, view }}
      nextCursor={nextCursor}
    />
  );
}
