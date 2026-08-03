import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedStaffProfiles } from "@/lib/staffCache";
import {
  APPOINTMENT_TYPES,
  CALENDAR_VIEWS,
  JOB_APPOINTMENT_SELECT,
  expandJobsToAppointments,
  rangeForView,
  todayInBusinessTz,
  type AppointmentJob,
  type AppointmentType,
  type CalendarView,
} from "@/lib/appointments";
import CalendarClient from "./CalendarClient";

export const dynamic = "force-dynamic";

/** YYYY-MM-DD, and a real date once parsed. */
function isValidISODate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    type?: string;
    staff?: string;
  }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const today = todayInBusinessTz();

  const view: CalendarView = CALENDAR_VIEWS.includes(params.view as CalendarView)
    ? (params.view as CalendarView)
    : "month";
  const anchor = isValidISODate(params.date) ? params.date : today;
  const typeFilter: AppointmentType | "All" = APPOINTMENT_TYPES.includes(
    params.type as AppointmentType
  )
    ? (params.type as AppointmentType)
    : "All";
  const staffFilter = params.staff || "All";

  const { from, to } = rangeForView(view, anchor);

  const supabase = await createClient();

  // Only the visible window is fetched. A job qualifies if any of its three
  // slot dates lands in range — the same cross-column OR the Jobs page uses.
  const query = supabase
    .from("jobs")
    .select(JOB_APPOINTMENT_SELECT)
    .or(
      `and(visit_date.gte.${from},visit_date.lte.${to}),` +
        `and(job_date.gte.${from},job_date.lte.${to}),` +
        `and(second_visit_date.gte.${from},second_visit_date.lte.${to})`
    )
    .limit(800);

  const [jobsRes, profiles] = await Promise.all([query, getCachedStaffProfiles()]);

  const jobs = (jobsRes.data ?? []) as unknown as AppointmentJob[];

  const staffNames = new Map<string, string>(
    (profiles ?? []).map((profile: any) => [
      profile.id as string,
      (profile.full_name || profile.name || "Assigned staff") as string,
    ])
  );

  // Expansion pulls in every slot of a matched job, including ones outside the
  // window — clip them, or a job matched on its site visit would draw a job
  // slot months away.
  const inRange = expandJobsToAppointments(jobs, staffNames).filter(
    (appointment) => appointment.date >= from && appointment.date <= to
  );

  // The dropdown is built before filtering, so picking a name does not empty
  // the list of names. Engineers are free text (see resolveAssignee), which
  // is also why this filter runs here rather than as a `.eq()` on the query.
  const engineers = Array.from(
    new Set(inRange.map((appointment) => appointment.assignee).filter((name): name is string => Boolean(name)))
  ).sort((a, b) => a.localeCompare(b));

  const appointments = inRange.filter(
    (appointment) =>
      (typeFilter === "All" || appointment.type === typeFilter) &&
      (staffFilter === "All" ||
        (staffFilter === "unassigned" ? !appointment.assignee : appointment.assignee === staffFilter))
  );

  return (
    <CalendarClient
      view={view}
      anchor={anchor}
      today={today}
      rangeFrom={from}
      rangeTo={to}
      appointments={appointments}
      engineers={engineers}
      typeFilter={typeFilter}
      staffFilter={staffFilter}
    />
  );
}
