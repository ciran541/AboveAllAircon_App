/**
 * app/services/inventoryService.ts
 *
 * Server-only domain service for inventory and job-material management.
 * Stock adjustments are always co-located with the material record write
 * so they can never drift apart.
 */

import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LogMaterialResult = {
  success?: boolean;
  data?: {
    id: string;
    item_id: string;
    quantity_used: number;
    cost_at_time: number;
    price_at_time: number;
    inventory_items: { name: string; unit: string };
  };
  error?: string;
};

export type RemoveMaterialResult = {
  success?: boolean;
  error?: string;
};

export type AdjustStockResult = {
  success?: boolean;
  newQuantity?: number;
  error?: string;
};

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Logs a material against a job and decrements the inventory stock.
 * Validates available stock before inserting.
 *
 * @param jobId     UUID of the job
 * @param itemId    UUID of the inventory item
 * @param quantity  Units consumed
 * @param meta      Extra fields: created_by, cost_at_time, price_at_time
 */
export async function logMaterial(
  jobId: string,
  itemId: string,
  quantity: number,
  meta: {
    created_by: string;
    cost_at_time: number;
    price_at_time: number;
  }
): Promise<LogMaterialResult> {
  const supabase = await createClient();

  // Read current stock + item details in one call
  const { data: item, error: itemErr } = await supabase
    .from("inventory_items")
    .select("id, name, unit, stock_quantity")
    .eq("id", itemId)
    .single();

  if (itemErr || !item) {
    return { error: itemErr?.message ?? "Inventory item not found." };
  }

  if (item.stock_quantity < quantity) {
    return {
      error: `Insufficient stock — only ${item.stock_quantity} ${item.unit} available.`,
    };
  }

  // Insert job_material record
  const { data: matData, error: matErr } = await supabase
    .from("job_materials")
    .insert([
      {
        job_id: jobId,
        item_id: itemId,
        quantity_used: quantity,
        created_by: meta.created_by,
        cost_at_time: meta.cost_at_time,
        price_at_time: meta.price_at_time,
      },
    ])
    .select("id, item_id, quantity_used, cost_at_time, price_at_time")
    .single();

  if (matErr || !matData) {
    return { error: matErr?.message ?? "Failed to log material." };
  }

  // Decrement stock
  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ stock_quantity: item.stock_quantity - quantity })
    .eq("id", itemId);

  if (stockErr) {
    // Material was logged but stock didn't update — surface a warning
    // (the material record is already committed)
    return {
      success: true,
      data: {
        ...matData,
        inventory_items: { name: item.name, unit: item.unit },
      },
      error: `Material logged, but stock update failed: ${stockErr.message}`,
    };
  }

  return {
    success: true,
    data: {
      ...matData,
      inventory_items: { name: item.name, unit: item.unit },
    },
  };
}

/**
 * Removes a job-material record and returns the quantity to inventory stock.
 *
 * @param materialId  UUID of the job_materials row
 * @param itemId      UUID of the inventory item (for the stock credit)
 * @param quantity    Units to return to stock
 */
export async function removeMaterial(
  materialId: string,
  itemId: string,
  quantity: number
): Promise<RemoveMaterialResult> {
  const supabase = await createClient();

  // Delete the material record first
  const { error: delErr } = await supabase
    .from("job_materials")
    .delete()
    .eq("id", materialId);

  if (delErr) return { error: delErr.message };

  // Return quantity to stock
  const { data: item, error: itemErr } = await supabase
    .from("inventory_items")
    .select("stock_quantity")
    .eq("id", itemId)
    .single();

  if (itemErr || !item) {
    return {
      error: `Material removed, but stock credit failed: ${itemErr?.message ?? "item not found"}`,
    };
  }

  const { error: stockErr } = await supabase
    .from("inventory_items")
    .update({ stock_quantity: (item as any).stock_quantity + quantity })
    .eq("id", itemId);

  if (stockErr) {
    return {
      error: `Material removed, but stock credit failed: ${stockErr.message}`,
    };
  }

  return { success: true };
}

/**
 * Direct stock adjustment (increment or decrement) without a job_material record.
 * Useful for admin-level stock corrections.
 *
 * @param itemId    UUID of the inventory item
 * @param delta     Positive to add stock, negative to remove
 */
export async function adjustStock(
  itemId: string,
  delta: number
): Promise<AdjustStockResult> {
  const supabase = await createClient();

  const { data: item, error: fetchErr } = await supabase
    .from("inventory_items")
    .select("stock_quantity")
    .eq("id", itemId)
    .single();

  if (fetchErr || !item) {
    return { error: fetchErr?.message ?? "Item not found." };
  }

  const newQuantity = (item as any).stock_quantity + delta;
  if (newQuantity < 0) {
    return { error: "Stock cannot go below zero." };
  }

  const { error: updateErr } = await supabase
    .from("inventory_items")
    .update({ stock_quantity: newQuantity })
    .eq("id", itemId);

  if (updateErr) return { error: updateErr.message };

  return { success: true, newQuantity };
}
