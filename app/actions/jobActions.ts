"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateJobStage(jobId: string, newStage: string, updates: any) {
  const supabase = await createClient();
  const dbStage = newStage === "First Visit" ? "In Progress" : newStage;
  const finalUpdates = { stage: dbStage, ...updates };

  const { error } = await supabase.from("jobs").update(finalUpdates).eq("id", jobId);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/dashboard/jobs");
  return { success: true };
}

export async function deleteJob(jobId: string) {
  const supabase = await createClient();
  
  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  
  if (error) {
    return { error: error.message };
  }
  
  revalidatePath("/dashboard/jobs");
  return { success: true };
}

export async function saveJob(dataToSave: any, newCustomerData?: any) {
  const supabase = await createClient();

  try {
    let finalCustomerId = dataToSave.customer_id;

    if (newCustomerData) {
      const { data: newCustData, error: custErr } = await supabase
        .from("customers")
        .insert([{
          name: newCustomerData.name,
          phone: newCustomerData.phone || null,
          address: newCustomerData.address || null,
          unit_type: newCustomerData.unit_type || null,
        }])
        .select()
        .single();

      if (custErr) return { error: custErr.message };
      finalCustomerId = newCustData.id;
    }

    const payload = { ...dataToSave, customer_id: finalCustomerId };

    let savedJob;
    if (!payload.id) {
       // Insert
       const { data, error: insertError } = await supabase.from("jobs").insert([payload]).select().single();
       if (insertError) return { error: insertError.message };
       savedJob = data;
    } else {
       // Update
       const { id, ...updatePayload } = payload;
       const { data, error: updateError } = await supabase.from("jobs").update(updatePayload).eq("id", id).select().single();
       if (updateError) return { error: updateError.message };
       savedJob = data;
    }

    if (savedJob) {
      const { data: fullJob } = await supabase
        .from("jobs")
        .select("*, customers(*)")
        .eq("id", savedJob.id)
        .single();
      
      revalidatePath("/dashboard/jobs");
      return { success: true, savedJob: fullJob };
    }
    
    return { error: "Unknown error occurred" };
  } catch (err: any) {
    return { error: err.message };
  }
}

