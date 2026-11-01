import { expect, test } from "bun:test";
import { readDependencyConfig, readListenConfig } from "./config";

const anon = `e30.${btoa(JSON.stringify({ role: "anon" }))}.signature`;

test("listen configuration defaults to loopback and validates explicit host and port", () => {
  expect(readListenConfig({})).toEqual({ port: 3000, hostname: "127.0.0.1" });
  expect(readListenConfig({ API_PORT: "65535", API_HOST: "0.0.0.0" })).toEqual({
    port: 65535,
    hostname: "0.0.0.0",
  });
  for (const API_PORT of ["0", "-1", "65536", "3000.5", "NaN", "", "3000/private"]) {
    expect(() => readListenConfig({ API_PORT })).toThrow("Invalid API listen configuration.");
  }
  expect(() => readListenConfig({ API_HOST: "untrusted.example" })).toThrow(
    "Invalid API listen configuration.",
  );
});

test("dependency configuration accepts loopback HTTP or hosted HTTPS with a public key", () => {
  expect(
    readDependencyConfig({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY: anon }),
  ).toEqual({ url: "http://127.0.0.1:54321", anonymousKey: anon });
  expect(
    readDependencyConfig({
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_ANON_KEY: "sb_publishable_disposable_test",
    }),
  ).toEqual({ url: "https://example.supabase.co", anonymousKey: "sb_publishable_disposable_test" });
});

test("readiness refuses incomplete, privileged or malformed dependency configuration", () => {
  expect(readDependencyConfig({})).toBeNull();
  expect(readDependencyConfig({ SUPABASE_URL: "http://127.0.0.1:54321" })).toBeNull();
  for (const SUPABASE_URL of [
    "invalid",
    "ftp://localhost",
    "http://external.example",
    "https://user:password@example.com",
    "https://example.com/?token=private",
    "https://example.com/#private",
    "https://example.com/path",
  ]) {
    expect(readDependencyConfig({ SUPABASE_URL, SUPABASE_ANON_KEY: anon })).toBeNull();
  }
  for (const SUPABASE_ANON_KEY of [
    "",
    "sb_secret_disposable_test",
    "not-a-key",
    "has whitespace",
    `e30.${btoa(JSON.stringify({ role: "service_role" }))}.signature`,
  ]) {
    expect(
      readDependencyConfig({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_ANON_KEY }),
    ).toBeNull();
  }
});
