import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  
  const userPromise = supabase.auth.getUser();
  const itemsPromise = supabase
    .from("inventory_items")
    .select("*")
    .order("name", { ascending: true });

  const logsPromise = supabase
    .from("inventory_logs")
    .select(`
      *,
      inventory_items(name, unit),
      jobs(customers(name))
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  const [userRes, itemsRes, logsRes] = await Promise.all([
    userPromise,
    itemsPromise,
    logsPromise
  ]);

  if (!userRes.data.user) {
    redirect("/login");
  }

  const initialItems = itemsRes.data || [];
  const initialLogs = logsRes.data || [];

  return (
    <InventoryClient
      initialItems={initialItems || []}
      initialLogs={initialLogs || []}
    />
  );
}
