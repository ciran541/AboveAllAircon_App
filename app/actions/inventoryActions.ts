"use server";

import * as InventoryService from "@/app/services/inventoryService";

/**
 * Adds a new material usage record to a job and updates inventory stock.
 */
export async function logJobMaterial(
  jobId: string,
  itemId: string,
  quantity: number,
  meta: {
    created_by: string;
    cost_at_time: number;
    price_at_time: number;
  }
) {
  return InventoryService.logMaterial(jobId, itemId, quantity, meta);
}

/**
 * Removes a job material usage record and restores inventory stock.
 */
export async function removeJobMaterial(
  materialId: string,
  itemId: string,
  quantity: number
) {
  return InventoryService.removeMaterial(materialId, itemId, quantity);
}

/**
 * Adjusts stock directly.
 */
export async function adjustInventoryStock(itemId: string, delta: number) {
  return InventoryService.adjustStock(itemId, delta);
}
