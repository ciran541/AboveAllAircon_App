const fs = require("fs");
const path = require("path");

async function main() {
  const envPath = path.join(process.cwd(), ".env.local");
  const envContent = fs.readFileSync(envPath, "utf8");
  const env = {};
  envContent
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .forEach((l) => {
      const idx = l.indexOf("=");
      if (idx === -1) return;
      env[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
    });

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  const sqls = [
    "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cal_event_id_site_visit text",
    "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cal_event_id_job text",
    "ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cal_event_id_second_visit text",
    "CREATE INDEX IF NOT EXISTS idx_jobs_cal_site_visit ON public.jobs(cal_event_id_site_visit)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_cal_job ON public.jobs(cal_event_id_job)",
    "CREATE INDEX IF NOT EXISTS idx_jobs_cal_second_visit ON public.jobs(cal_event_id_second_visit)",
  ];

  const { default: fetch } = await import("node-fetch");
  const projectRef = url.replace("https://", "").split(".")[0];
  console.log(`Applying migration to project: ${projectRef}\n`);

  for (const sql of sqls) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("FAIL:", sql.substring(0, 70));
      console.error("  →", JSON.stringify(data));
    } else {
      console.log("OK  :", sql.substring(0, 70));
    }
  }
  console.log("\nDone.");
}

main().catch(console.error);
