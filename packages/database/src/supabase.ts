import { createClient, processLock, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

type AuthStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
};

function required(name: string, value: string | undefined): string {
  const result = value?.trim();
  if (!result) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return result;
}

function validUrl(name: string, value: string | undefined): string {
  const result = required(name, value);
  try {
    new URL(result);
  } catch {
    throw new Error(`Environment variable ${name} must be a valid URL`);
  }
  return result;
}

export function createMobileSupabaseClient(config: {
  url?: string;
  anonKey?: string;
  storage: AuthStorage;
}): SupabaseClient<Database> {
  return createClient<Database>(
    validUrl("EXPO_PUBLIC_SUPABASE_URL", config.url),
    required("EXPO_PUBLIC_SUPABASE_ANON_KEY", config.anonKey),
    {
      auth: {
        storage: config.storage,
        flowType: "pkce",
        lock: processLock,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: true,
      },
    },
  );
}

export function createServerSupabaseClient(config: {
  url?: string;
  serviceRoleKey?: string;
}): SupabaseClient<Database> {
  return createClient<Database>(
    validUrl("SUPABASE_URL", config.url),
    required("SUPABASE_SERVICE_ROLE_KEY", config.serviceRoleKey),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
