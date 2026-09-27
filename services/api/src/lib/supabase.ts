import { createServerSupabaseClient } from "@stockpot/database";

export function getSupabaseAdmin() {
  return createServerSupabaseClient({
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
