import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedStaffProfiles } from "@/lib/staffCache";
import {
  JOB_ATTENTION_SELECT,
  JOB_APPOINTMENT_SELECT,
  addDays,
  expandJobsToAppointments,
  todayInBusinessTz,
  type AppointmentJob,
} from "@/lib/appointments";
import { buildAttentionLists, type AttentionJob } from "@/lib/attention";
import OverviewClient from "./OverviewClient";

export const dynamic = "force-dynamic";

/** Days of schedule loaded up front, so the day strip needs no refetch. */
const STRIP_DAYS = 7;
/** Ceiling on the open-job scan behind the attention lists. */
const OPEN_JOB_LIMIT = 500;

export default async function OverviewPage() {
  await requireAdmin();

  const supabase = await createClient();

  // "Today" must be resolved in the business timezone, not the server's UTC —
  // see todayInBusinessTz() for why.
  const today = todayInBusinessTz();
  const stripEnd = addDays(today, STRIP_DAYS - 1);

  const [scheduleRes, openJobsRes, profiles] = await Promise.all([
    // Appointments across the visible strip. A job lands here if *any* of its
    // three slot dates falls in range — the same cross-column OR the Jobs page
    // uses for its date filter.
    supabase
      .from("jobs")
      .select(JOB_APPOINTMENT_SELECT)
      .or(
        `and(visit_date.gte.${today},visit_date.lte.${stripEnd}),` +
          `and(job_date.gte.${today},job_date.lte.${stripEnd}),` +
          `and(second_visit_date.gte.${today},second_visit_date.lte.${stripEnd})`
      )
      .limit(400),

    // Everything still open, plus completed-but-unpaid, which the receivables
    // rule needs and `status = 'open'` alone would miss.
    supabase
      .from("jobs")
      .select(JOB_ATTENTION_SELECT)
      .or(`status.eq.open,status.is.null,and(stage.eq.Completed,payment_status.eq.Pending)`)
      .order("created_at", { ascending: false })
      .limit(OPEN_JOB_LIMIT),

    getCachedStaffProfiles(),
  ]);

  const scheduleJobs = (scheduleRes.data ?? []) as unknown as AppointmentJob[];
  const openJobs = (openJobsRes.data ?? []) as unknown as AttentionJob[];

  // Only a fallback for the (currently unused) assigned_to link — the real
  // assignee lives in engineer_name. See resolveAssignee().
  const staffNames = new Map<string, string>(
    (profiles ?? []).map((profile: any) => [
      profile.id as string,
      (profile.full_name || profile.name || "Assigned staff") as string,
    ])
  );

  const appointments = expandJobsToAppointments(scheduleJobs, staffNames).filter(
    (appointment) => appointment.date >= today && appointment.date <= stripEnd
  );

  const attention = buildAttentionLists(openJobs, today, staffNames);

  return (
    <OverviewClient
      today={today}
      stripDays={STRIP_DAYS}
      appointments={appointments}
      attention={attention}
    />
  );
}
