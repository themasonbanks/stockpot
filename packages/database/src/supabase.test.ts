import { describe, expect, test } from "bun:test";

import { createMobileSupabaseClient, createServerSupabaseClient } from "./supabase";

const storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

describe("Supabase client configuration", () => {
  test("rejects missing mobile configuration", () => {
    expect(() => createMobileSupabaseClient({ storage })).toThrow(
      "Missing required environment variable: EXPO_PUBLIC_SUPABASE_URL",
    );
  });

  test("rejects malformed URLs", () => {
    expect(() => createServerSupabaseClient({ url: "stockpot", serviceRoleKey: "secret" })).toThrow(
      "Environment variable SUPABASE_URL must be a valid URL",
    );
  });

  test("creates typed mobile and server clients", () => {
    expect(
      createMobileSupabaseClient({ url: "http://localhost:54321", anonKey: "anon", storage }),
    ).toBeDefined();
    expect(
      createServerSupabaseClient({ url: "http://localhost:54321", serviceRoleKey: "service" }),
    ).toBeDefined();
  });
});
