import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InventoryClient from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch role from profiles table
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role: "admin" | "staff" = profile?.role ?? "staff";

  // Prevent staff access
  if (role !== "admin") {
    redirect("/dashboard");
  }

  // Fetch initial items
  const { data: initialItems } = await supabase
    .from("inventory_items")
    .select("*")
    .order("name", { ascending: true });

  // Fetch recent logs
  const { data: initialLogs } = await supabase
    .from("inventory_logs")
    .select(`
      *,
      inventory_items(name, unit),
      jobs(customers(name))
    `)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <InventoryClient
      initialItems={initialItems || []}
      initialLogs={initialLogs || []}
    />
  );
}
