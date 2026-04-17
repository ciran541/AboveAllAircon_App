"use server";

import * as CustomerService from "@/app/services/customerService";

export async function saveCustomer(formData: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  unit_type?: string;
}) {
  return CustomerService.saveCustomer(formData);
}

export async function updateCustomerDetails(
  customerId: string,
  updates: Partial<{
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    unit_type: string | null;
  }>
) {
  return CustomerService.updateCustomer(customerId, updates);
}
