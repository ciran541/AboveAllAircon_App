/**
 * lib/staffCache.ts
 *
 * The staff/profiles list (id, name, role) is fetched fresh, independently,
 * on Jobs, Job Detail, and Users every single navigation, despite only
 * changing when someone's role/name is edited. Caching it removes a
 * redundant Supabase round trip from three of the app's busiest routes.
 */

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const getCachedStaffProfiles = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, role, full_name, name, email");
    return data ?? [];
  },
  ["staff-profiles"],
  { tags: ["profiles"], revalidate: 300 }
);
