import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processQueueRow, reconcileCalendar, type SyncQueueRow } from "@/lib/syncProcessor";
import { maybeSendSyncDigest } from "@/lib/alertMail";

export const maxDuration = 60;

/**
 * Daily safety net for the sync_queue (Vercel Hobby plan only allows a
 * once-a-day cron). The primary processing path is after() scheduled
 * right after each job save (see app/services/jobService.ts) — this route
 * only catches rows that after() didn't manage to finish (crashed
 * invocation, hit maxDuration, etc.) or that exhausted their earlier
 * backoff window.
 *
 * Also runs the calendar drift check — catches events that were manually
 * deleted directly in Calendar (soft-deleted to "cancelled", invisible in
 * the UI) since these never surface as a sync_queue failure: our own PATCH
 * against that same event id still returns 200 OK.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_sync_queue_batch", {
    p_limit: 100,
    p_stale_after: "10 minutes",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (claimed ?? []) as SyncQueueRow[];
  await Promise.allSettled(rows.map((row) => processQueueRow(admin, row)));

  const { checked, issues, healed } = await reconcileCalendar(admin, { heal: true });

  // Anything still carrying an error after the queue drain above is a genuine
  // unresolved failure, not a transient mid-retry state.
  const { data: stillFailing } = await admin
    .from("sync_queue")
    .select("job_id, integration, last_error")
    .not("last_error", "is", null);

  const failedSyncs = (stillFailing ?? []).map((f: any) => ({
    jobId: f.job_id,
    integration: f.integration,
    error: f.last_error,
  }));

  const alert = await maybeSendSyncDigest({
    issues,
    failedSyncs,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });

  return NextResponse.json({
    claimed: rows.length,
    reconciliation: {
      checked,
      issues: issues.length,
      healed,
      // Conflicts aren't auto-fixed by design — they need a human decision.
      conflicts: issues.filter((i) => i.state === "time_mismatch").length,
    },
    alert,
  });
}
