import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processQueueRow, type SyncQueueRow } from "@/lib/syncProcessor";

export const maxDuration = 60;

/**
 * Daily safety net for the sync_queue (Vercel Hobby plan only allows a
 * once-a-day cron). The primary processing path is after() scheduled
 * right after each job save (see app/services/jobService.ts) — this route
 * only catches rows that after() didn't manage to finish (crashed
 * invocation, hit maxDuration, etc.) or that exhausted their earlier
 * backoff window.
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

  return NextResponse.json({ claimed: rows.length });
}
