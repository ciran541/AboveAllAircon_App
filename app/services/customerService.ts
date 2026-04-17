/**
 * app/services/customerService.ts
 *
 * Server-only domain service for customer mutations.
 * Import and call from Server Actions only — never from client components.
 */

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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
    const { error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", formData.id);

    if (error) return { error: error.message };

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

  const { error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", customerId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/customers");
  return { success: true };
}
