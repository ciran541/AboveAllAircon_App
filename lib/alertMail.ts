/**
 * lib/alertMail.ts
 *
 * Emails a digest of unresolved sync problems, delivered through a Google
 * Apps Script webhook — the same rail already used for the Sheets backup, so
 * this needs no npm dependency, no API key and no domain verification.
 *
 * Deliberately only called from the daily cron. When someone is in the app,
 * a failed save already tells them inline; an email ten seconds later is
 * noise. Email exists for the case where nobody is looking.
 */

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReconciliationIssue } from "@/lib/syncProcessor";

const ALERT_WEBHOOK_URL = process.env.GOOGLE_ALERT_WEBHOOK_URL ?? "";
const ALERT_SECRET = process.env.GOOGLE_ALERT_SECRET ?? "";

/** Re-send an unchanged problem set at most this often. */
const REMINDER_AFTER_DAYS = 7;
/** Never list more than this many items in one email. */
const MAX_ITEMS = 10;

export type FailedSyncSummary = {
  jobId: string;
  integration: string;
  customerName?: string | null;
  error: string | null;
};

const STATE_TEXT: Record<string, string> = {
  no_event_id: "has no calendar event",
  missing: "calendar event was deleted",
  cancelled: "calendar event is cancelled",
  time_mismatch: "time differs from Calendar",
};

async function postToAppsScript(subject: string, body: string): Promise<void> {
  const res = await fetch(ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: ALERT_SECRET, subject, body }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Alert webhook failed: ${res.status} ${text}`);
  }
}

/**
 * Sends a digest only when the set of unresolved problems has actually
 * changed, has gone stale enough to be worth repeating, or has just cleared.
 * Never throws: alerting must not be able to fail the cron run.
 */
export async function maybeSendSyncDigest(params: {
  issues: ReconciliationIssue[];
  failedSyncs: FailedSyncSummary[];
  appUrl?: string;
}): Promise<{ sent: boolean; reason: string }> {
  try {
    if (!ALERT_WEBHOOK_URL) return { sent: false, reason: "no webhook configured" };

    const admin = createAdminClient();

    // Conflicts need a human decision; broken events are auto-repaired and so
    // aren't worth an email unless the repair itself failed (which shows up
    // as a failing sync instead).
    const conflicts = params.issues.filter((i) => i.state === "time_mismatch");
    const items = [
      ...conflicts.map((i) => ({
        key: `conflict:${i.jobId}:${i.eventType}`,
        text: `${i.customerName ?? i.jobId.slice(0, 8)} — ${i.eventType.replace(/_/g, " ")} ${STATE_TEXT[i.state]}`,
      })),
      ...params.failedSyncs.map((f) => ({
        key: `failed:${f.jobId}:${f.integration}`,
        text: `${f.customerName ?? f.jobId.slice(0, 8)} — ${f.integration} sync failing${f.error ? `: ${f.error.slice(0, 120)}` : ""}`,
      })),
    ];

    const fingerprint = items.length
      ? crypto.createHash("sha256").update(items.map((i) => i.key).sort().join("|")).digest("hex")
      : null;

    const { data: state } = await admin
      .from("sync_alert_state")
      .select("fingerprint, last_sent_at")
      .eq("id", 1)
      .maybeSingle();

    const previous = state?.fingerprint ?? null;
    const lastSentAt = state?.last_sent_at ? new Date(state.last_sent_at).getTime() : 0;
    const staleFor = Date.now() - lastSentAt;
    const reminderDue = staleFor > REMINDER_AFTER_DAYS * 86_400_000;

    const save = async (fp: string | null, sent: boolean) => {
      await admin
        .from("sync_alert_state")
        .update({
          fingerprint: fp,
          updated_at: new Date().toISOString(),
          ...(sent ? { last_sent_at: new Date().toISOString() } : {}),
        })
        .eq("id", 1);
    };

    // Everything is clean now, but wasn't last time — confirm the all-clear once.
    if (!fingerprint) {
      if (previous) {
        await postToAppsScript(
          "Aircon app: calendar sync is healthy again",
          "All previously reported calendar sync problems are resolved.\n\nNothing further to do."
        );
        await save(null, true);
        return { sent: true, reason: "all clear" };
      }
      return { sent: false, reason: "nothing wrong" };
    }

    const unchanged = fingerprint === previous;
    if (unchanged && !reminderDue) {
      return { sent: false, reason: "same problems, already reported" };
    }

    const shown = items.slice(0, MAX_ITEMS).map((i) => `• ${i.text}`).join("\n");
    const overflow = items.length > MAX_ITEMS ? `\n…and ${items.length - MAX_ITEMS} more.` : "";
    const link = params.appUrl ? `\n\nReview and fix: ${params.appUrl}/dashboard/logs` : "";

    await postToAppsScript(
      unchanged
        ? `Aircon app: ${items.length} calendar sync issue${items.length === 1 ? "" : "s"} still unresolved`
        : `Aircon app: ${items.length} calendar sync issue${items.length === 1 ? "" : "s"} need attention`,
      `${unchanged ? "These are still unresolved:" : "The following need attention:"}\n\n${shown}${overflow}${link}`
    );

    await save(fingerprint, true);
    return { sent: true, reason: unchanged ? "reminder" : "new problems" };
  } catch (err: any) {
    console.error("[alertMail] digest failed:", err?.message ?? err);
    return { sent: false, reason: "error" };
  }
}
