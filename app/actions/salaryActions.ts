"use server";

import * as SalaryService from "@/app/services/salaryService";
import { getAuthUser } from "@/lib/auth";

// ── Workers ───────────────────────────────────────────────────────────────────

export async function getWorkers() {
  return SalaryService.getWorkers();
}

export async function createWorker(data: {
  name: string;
  wp_number?: string;
  basic_salary: number;
  bank_account?: string;
}) {
  const user = await getAuthUser();
  if (user.role !== "admin") return { error: "Unauthorized" };
  return SalaryService.createWorker(data);
}

export async function updateWorker(
  id: string,
  updates: Partial<{
    name: string;
    wp_number: string;
    basic_salary: number;
    bank_account: string;
  }>
) {
  const user = await getAuthUser();
  if (user.role !== "admin") return { error: "Unauthorized" };
  return SalaryService.updateWorker(id, updates);
}

export async function deleteWorker(id: string) {
  const user = await getAuthUser();
  if (user.role !== "admin") return { error: "Unauthorized" };
  return SalaryService.deleteWorker(id);
}

// ── OT Entries ────────────────────────────────────────────────────────────────

export async function getOtEntries(month: number, year: number) {
  return SalaryService.getOtEntries(month, year);
}

export async function addOtEntry(entry: {
  worker_id: string;
  entry_date: string;
  hours: number;
  notes?: string;
}) {
  const user = await getAuthUser();
  return SalaryService.addOtEntry(entry, user.id);
}

export async function deleteOtEntry(id: string) {
  return SalaryService.deleteOtEntry(id);
}

// ── Payslips ──────────────────────────────────────────────────────────────────

export async function getPayslips(month: number, year: number) {
  return SalaryService.getPayslips(month, year);
}

export async function createMonthlyPayslips(month: number, year: number, workingDays?: number) {
  const user = await getAuthUser();
  if (user.role !== "admin") return { error: "Unauthorized" };
  return SalaryService.createMonthlyPayslips(month, year, workingDays);
}

export async function signPayslip(payslipId: string) {
  return SalaryService.signPayslip(payslipId);
}
