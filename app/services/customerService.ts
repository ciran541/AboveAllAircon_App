/**
 * app/services/customerService.ts
 *
 * Server-only domain service for customer mutations.
 * Import and call from Server Actions only — never from client components.
 */

import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { diffJob, customerAffectsCalendar } from "@/lib/jobDiff";
import { processJobQueue } from "@/lib/syncProcessor";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A customer's name / phone / address are embedded in the summary and
 * description of every Calendar event for their jobs, but nothing here used
 * to trigger a re-sync — so renaming a customer left all of their events
 * showing the old details indefinitely.
 *
 * Re-syncs their scheduled jobs from ~60 days back onward; older jobs are
 * historical and not worth the API calls.
 */
async function propagateCustomerChangeToCalendar(
  customerId: string,
  supabase: SupabaseClient
): Promise<void> {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 60);
  const from = windowStart.toISOString().slice(0, 10);

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("customer_id", customerId)
    .or(`visit_date.gte.${from},job_date.gte.${from},second_visit_date.gte.${from}`);

  const jobIds = (jobs ?? []).map((j: any) => j.id);
  if (jobIds.length === 0) return;

  for (const jobId of jobIds) {
    await supabase.rpc("enqueue_sync", { p_job_id: jobId, p_integration: "calendar" });
  }

  // Sequentially in the background — a customer with many active jobs would
  // otherwise fire a burst of Calendar writes and trip Google's rate limit.
  after(async () => {
    for (const jobId of jobIds) {
      await processJobQueue(jobId).catch(() => {});
    }
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type SaveCustomerInput = {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  unit_type?: string | null;
};

export type SaveCustomerResult = {
  success?: boolean;
  customerId?: string;
  error?: string;
};

export type UpdateCustomerResult = {
  success?: boolean;
  error?: string;
};

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Creates a new customer or updates an existing one.
 * Returns the ID of the affected customer on success.
 */
export async function saveCustomer(
  formData: SaveCustomerInput
): Promise<SaveCustomerResult> {
  const supabase = await createClient();

  const payload = {
    name: formData.name,
    phone: formData.phone ?? null,
    email: formData.email ?? null,
    address: formData.address ?? null,
    unit_type: formData.unit_type ?? null,
  };

  if (formData.id) {
    const { data: before } = await supabase
      .from("customers")
      .select("name, phone, address, unit_type")
      .eq("id", formData.id)
      .single();

    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", formData.id);

    if (error) return { error: error.message };

    if (customerAffectsCalendar(diffJob(before, payload))) {
      await propagateCustomerChangeToCalendar(formData.id, supabase);
    }

    revalidatePath("/dashboard/customers");
    return { success: true, customerId: formData.id };
  } else {
    const { data, error } = await supabase
      .from("customers")
      .insert([payload])
      .select("id")
      .single();

    if (error) return { error: error.message };

    revalidatePath("/dashboard/customers");
    return { success: true, customerId: data.id };
  }
}

/**
 * Applies a partial update to a customer record.
 * Designed for targeted field updates (e.g., unit_type from Job Detail page).
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    unit_type: string | null;
  }>
): Promise<UpdateCustomerResult> {
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("customers")
    .select("name, phone, address, unit_type")
    .eq("id", customerId)
    .single();

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", customerId);

  if (error) return { error: error.message };

  if (customerAffectsCalendar(diffJob(before, updates))) {
    await propagateCustomerChangeToCalendar(customerId, supabase);
  }

  revalidatePath("/dashboard/customers");
  return { success: true };
}
