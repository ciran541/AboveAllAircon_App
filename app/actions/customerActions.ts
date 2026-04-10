"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveCustomer(formData: {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const supabase = await createClient();

  const payload = {
    name: formData.name,
    phone: formData.phone || null,
    email: formData.email || null,
    address: formData.address || null,
  };

  let error;
  if (formData.id) {
    ({ error } = await supabase.from("customers").update(payload).eq("id", formData.id));
  } else {
    ({ error } = await supabase.from("customers").insert([payload]));
  }

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/customers");
  return { success: true };
}
