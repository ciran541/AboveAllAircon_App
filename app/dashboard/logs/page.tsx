import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileCalendar } from "@/lib/syncProcessor";
import LogsClient from "./LogsClient";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

export default async function SyncHealthPage({
  searchParams,
}: {
  searchParams?: Promise<{ operation?: string; outcome?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const operation = params?.operation || "All";
  const outcome = params?.outcome || "All";
  const q = params?.q?.trim() || "";
  const page = Math.max(1, parseInt(params?.page || "1", 10) || 1);

  const admin = createAdminClient();

  let query = admin
    .from("calendar_event_log")
    .select("id, job_id, event_type, operation, event_id, success, error, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (operation !== "All") query = query.eq("operation", operation);
  if (outcome === "success") query = query.eq("success", true);
  if (outcome === "failed") query = query.eq("success", false);
  if (q) query = query.or(`event_id.ilike.%${q}%,error.ilike.%${q}%`);

  // Live reconciliation rather than a stored copy: at this size it's one
  // Calendar listing plus one jobs query, and a stored snapshot would be
  // stale-by-design between cron runs — contradicting reality is worse than
  // recomputing on an admin page nobody loads in a loop.
  const [{ data: logs, count }, reconciliation, { data: failedSyncs }] = await Promise.all([
    query,
    reconcileCalendar(admin).catch(() => ({ checked: 0, issues: [], healed: 0 })),
    admin
      .from("sync_queue")
      .select("job_id, integration, status, last_error, updated_at")
      .not("last_error", "is", null),
  ]);

  // Resolve customer names for the job ids on this page only — keeps the
  // listing readable without joining the whole jobs table on every query.
  const jobIds = Array.from(
    new Set([
      ...(logs ?? []).map((l) => l.job_id),
      ...(failedSyncs ?? []).map((f) => f.job_id),
    ].filter(Boolean))
  ) as string[];

  const jobNames: Record<string, string> = {};
  if (jobIds.length > 0) {
    const { data: jobs } = await admin.from("jobs").select("id, customers(name)").in("id", jobIds);
    for (const job of (jobs as any[]) ?? []) {
      const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
      if (customer?.name) jobNames[job.id] = customer.name;
    }
  }

  return (
    <LogsClient
      logs={logs ?? []}
      jobNames={jobNames}
      totalCount={count ?? 0}
      pageSize={PAGE_SIZE}
      filters={{ operation, outcome, q, page }}
      checked={reconciliation.checked}
      issues={reconciliation.issues}
      failedSyncs={(failedSyncs ?? []).map((f: any) => ({
        jobId: f.job_id,
        integration: f.integration,
        status: f.status,
        error: f.last_error,
      }))}
    />
  );
}
