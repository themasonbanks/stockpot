import { expect, test } from "bun:test";
import { createServer } from "node:net";
import {
  assertLocalPortAvailable,
  checkMobileEnvironment,
  LocalSetupError,
  localStack,
  mergeMobileEnvironment,
  prepareLocalInfrastructure,
  safeLocalError,
} from "./local-infrastructure";

const token = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
const stack = { url: "http://127.0.0.1:54321", anonKey: token("anon") };
test("port probe rejects a running IPv4 service without stopping it", async () => {
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve),
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected local TCP listener");
    await expect(assertLocalPortAvailable(address.port)).rejects.toThrow("already in use");
    expect(server.listening).toBe(true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("local setup refuses hosted endpoints and privileged mobile keys", () => {
  for (const url of [
    "https://example.com",
    "http://127.0.0.1:54321/other",
    "http://user:password@localhost:54321",
    "http://localhost:54321?key=private",
  ])
    expect(() => localStack(JSON.stringify({ API_URL: url, ANON_KEY: stack.anonKey }))).toThrow();
  expect(() =>
    localStack(JSON.stringify({ API_URL: stack.url, ANON_KEY: token("service_role") })),
  ).toThrow();
  expect(
    localStack(
      JSON.stringify({
        API_URL: stack.url,
        ANON_KEY: stack.anonKey,
        SERVICE_ROLE_KEY: "must never be returned",
      }),
    ),
  ).toEqual(stack);
});
test("existing mobile config is preserved and conflicting overrides are rejected", () => {
  const other = "# Keep this setting\nEXPO_PUBLIC_OTHER=value\n";
  const merged = mergeMobileEnvironment(other, stack);
  expect(merged.startsWith(other)).toBe(true);
  expect(mergeMobileEnvironment(merged, stack)).toBe(merged);
  expect(merged).not.toContain("SERVICE_ROLE");
  expect(() =>
    checkMobileEnvironment(`EXPO_PUBLIC_OTHER=${token("service_role")}`, stack),
  ).toThrow();
  expect(() => checkMobileEnvironment("EXPO_PUBLIC_OTHER=$PRIVATE_SERVER_KEY", stack)).toThrow();
  expect(() =>
    mergeMobileEnvironment("EXPO_PUBLIC_SUPABASE_URL=https://hosted.example\n", stack),
  ).toThrow();
  expect(() =>
    checkMobileEnvironment(`EXPO_PUBLIC_SUPABASE_ANON_KEY=${token("service_role")}`, stack),
  ).toThrow();
  expect(() =>
    checkMobileEnvironment("EXPO_PUBLIC_WHATEVER=sb_secret_privileged", stack),
  ).toThrow();
  expect(() =>
    checkMobileEnvironment(`${merged}EXPO_PUBLIC_SUPABASE_URL=https://override.example`, stack),
  ).toThrow();
  expect(() =>
    checkMobileEnvironment(`export EXPO_PUBLIC_SUPABASE_URL="${stack.url}" # local`, stack),
  ).not.toThrow();
});
test("setup applies only forward local migrations after verifying endpoint; runtime output stays private", async () => {
  const calls: string[][] = [],
    messages: string[] = [];
  let configured = false;
  await prepareLocalInfrastructure({
    async run(command) {
      calls.push(command);
      return command[1] === "status"
        ? JSON.stringify({
            API_URL: stack.url,
            ANON_KEY: stack.anonKey,
            SERVICE_ROLE_KEY: "private",
          })
        : "private runtime output";
    },
    async configure(value) {
      expect(value).toEqual(stack);
      configured = true;
    },
    progress(message) {
      messages.push(message);
    },
  });
  expect(calls.map((command) => command.join(" "))).toEqual([
    "docker info --format {{.ServerVersion}}",
    "supabase start",
    "supabase status -o json",
    "supabase migration up --local",
  ]);
  expect(configured).toBe(true);
  expect(messages.join(" ")).not.toContain("private");
  calls.length = 0;
  await expect(
    prepareLocalInfrastructure({
      async run(command) {
        calls.push(command);
        return command[1] === "status"
          ? JSON.stringify({ API_URL: "https://hosted.example", ANON_KEY: stack.anonKey })
          : "";
      },
      async configure() {
        throw new Error("must not configure");
      },
      progress() {},
    }),
  ).rejects.toThrow();
  expect(calls.some((command) => command.includes("migration"))).toBe(false);
});
test("only constructed safe errors reach local diagnostics", () => {
  expect(safeLocalError(new LocalSetupError("Open Docker Desktop."))).toBe("Open Docker Desktop.");
  expect(
    safeLocalError(new Error("private credential in unexpected upstream failure")),
  ).not.toContain("private credential");
});
test("Docker failure halts before any database operation", async () => {
  const calls: string[][] = [];
  await expect(
    prepareLocalInfrastructure({
      async run(command) {
        calls.push(command);
        throw new Error("engine unavailable");
      },
      async configure() {},
      progress() {},
    }),
  ).rejects.toThrow("engine unavailable");
  expect(calls).toHaveLength(1);
});
