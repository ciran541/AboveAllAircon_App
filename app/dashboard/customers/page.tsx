import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch customers with their related job counts
  const { data: customers } = await supabase
    .from("customers")
    .select("*, jobs(id)")
    .order("created_at", { ascending: false });

  return <CustomersClient initialCustomers={customers || []} />;
}
