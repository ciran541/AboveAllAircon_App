import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CustomersClient from "./CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams?: Promise<{ search?: string; limit?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const search = resolvedParams?.search || "";
  const limit = parseInt(resolvedParams?.limit || "20", 10);

  let query = supabase
    .from("customers")
    .select("*, jobs(id)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const { data: customers } = await query;

  // Also get total count to know if we can load more
  let countQuery = supabase
    .from("customers")
    .select("*", { count: "exact", head: true });
    
  if (search) {
     countQuery = countQuery.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  }
  const { count } = await countQuery;

  return (
    <CustomersClient 
       initialCustomers={customers || []} 
       totalCount={count || 0} 
       search={search}
       limit={limit}
    />
  );
}
