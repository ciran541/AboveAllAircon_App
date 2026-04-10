import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import JobsClient from "./JobsClient";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
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

  const limit = 300; // Hard cap for initial Kanban load to maintain lightning-fast performance

  // Fetch initial jobs
  const { data: initialJobs } = await supabase
    .from("jobs")
    .select("*, customers(name, phone, address, unit_type)")
    .order("created_at", { ascending: false })
    .limit(limit);

  let staffProfiles: { id: string; role: string; full_name?: string; email?: string }[] = [];
  if (role === "admin") {
    // We must use the admin client here because standard RLS blocks users from seeing other users' profiles
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const adminSupabase = createAdminClient();
    
    // Fetch all profiles
    const { data: profiles } = await adminSupabase
      .from("profiles")
      .select("id, role, full_name, name");
      
    // Fetch emails from auth.users (which requires admin rights)
    const { data: authData } = await adminSupabase.auth.admin.listUsers();
    const emailMap = new Map();
    if (authData?.users) {
      authData.users.forEach((u) => emailMap.set(u.id, u.email));
    }

    // Combine them
    staffProfiles = (profiles || []).map((p: any) => ({
      ...p,
      email: emailMap.get(p.id) || "",
    }));
  }

  return (
    <JobsClient
      initialJobs={initialJobs || []}
      userId={user.id}
      role={role}
      staffProfiles={staffProfiles}
    />
  );
}
