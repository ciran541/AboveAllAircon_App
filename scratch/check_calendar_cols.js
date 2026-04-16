const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

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
  const supabase = createClient(url, key);

  // Check what we already have
  const { data } = await supabase.from("jobs").select("*").limit(1);
  if (data && data.length > 0) {
    const cols = Object.keys(data[0]);
    const needed = ["visit_event_id", "second_visit_event_id", "job_event_id"];
    needed.forEach((c) => {
      console.log(`${c}: ${cols.includes(c) ? "EXISTS" : "MISSING"}`);
    });
  }
}

main().catch(console.error);
