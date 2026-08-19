/**
 * scripts/create-booking-bot.mjs
 *
 * Creates the "AI Assistant" identity that the booking API books as.
 *
 * jobs.created_by is a real FK to profiles and the jobs RLS policies are
 * written around `created_by = auth.uid()`, so bookings need a user of their
 * own. Doing it this way rather than leaving created_by null under the service
 * role means job_activity says who booked a job, and an admin can filter the
 * board by what the bot brought in.
 *
 * Idempotent: run it as many times as you like. If the auth user already
 * exists it is reused, and the profile is upserted.
 *
 * Usage (from the repo root):
 *   node scripts/create-booking-bot.mjs
 *
 * Then put the printed id in BOOKING_BOT_USER_ID (optional — the service falls
 * back to looking the profile up by name, this just saves a query per cold
 * start).
 */

import fs from "node:fs";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const raw = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnvLocal();

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const BOT_NAME = "AI Assistant";
const BOT_EMAIL = process.env.BOOKING_BOT_EMAIL || "ai-assistant@aboveallaircon.sg";

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ── Run ───────────────────────────────────────────────────────────────────────

async function findExistingUser(email) {
  // listUsers is paged; this project has a handful of users, but page through
  // anyway so this doesn't quietly stop working when it doesn't.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  let user = await findExistingUser(BOT_EMAIL);

  if (user) {
    console.log(`Auth user already exists: ${BOT_EMAIL}`);
  } else {
    // A random password nobody is meant to know. The bot never signs in — it
    // reaches the API through BOOKING_API_SECRET and the route writes as the
    // service role; this user exists to be an identity, not a login.
    const { data, error } = await supabase.auth.admin.createUser({
      email: BOT_EMAIL,
      password: crypto.randomBytes(32).toString("base64url"),
      email_confirm: true,
    });
    if (error) {
      console.error(`Could not create the auth user: ${error.message}`);
      process.exit(1);
    }
    user = data.user;
    console.log(`Created auth user: ${BOT_EMAIL}`);
  }

  // 'staff', not 'admin': nothing about this identity should be able to see or
  // do more than the jobs it books. The routes run as the service role anyway,
  // so this role grants the bot nothing — it only keeps the profile honest.
  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, role: "staff", full_name: BOT_NAME });

  if (profileError) {
    console.error(`Could not upsert the profile: ${profileError.message}`);
    process.exit(1);
  }

  console.log(`Profile ready: ${BOT_NAME} (role: staff)`);
  console.log("");
  console.log("Add this to your env if you want to skip the lookup at runtime:");
  console.log(`BOOKING_BOT_USER_ID=${user.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
