import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { createHouseholdService } from "./households";

const userId = "00000000-0000-0000-0000-000000000001",
  otherId = "00000000-0000-0000-0000-000000000002";
const householdId = "10000000-0000-0000-0000-000000000001",
  otherHouseholdId = "10000000-0000-0000-0000-000000000002";
const timestamp = "2026-11-01T12:00:00Z";
const household = {
  id: householdId,
  name: "Our kitchen",
  timezone: "Europe/London",
  default_servings: 2,
  created_by_user_id: userId,
  created_at: timestamp,
  updated_at: timestamp,
  archived_at: null,
};
const membership = {
  id: "20000000-0000-0000-0000-000000000001",
  household_id: householdId,
  user_id: userId,
  role: "owner",
  slot: 1,
  joined_at: timestamp,
  updated_at: timestamp,
  archived_at: null,
};
const input = {
  requestId: householdId,
  name: " Our kitchen ",
  timezone: "Europe/London",
  defaultServings: 2,
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function fixture(respond?: (url: URL, body: unknown) => Response | undefined) {
  const requests: { url: URL; body: unknown }[] = [];
  const fakeFetch = (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });
    const override = respond?.(url, body);
    if (override) return override;
    if (url.pathname.endsWith("/user"))
      return json({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: timestamp,
      });
    if (url.pathname.endsWith("/rpc/create_household")) return json(household);
    if (url.pathname.endsWith("/household_members")) return json([membership]);
    if (url.pathname.endsWith("/households")) return json([household]);
    throw new Error("Unexpected request");
  }) as typeof fetch;
  const client = createClient<Database>("https://stockpot.test", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer test-token" }, fetch: fakeFetch },
  });
  return { service: createHouseholdService(client), requests };
}
describe("household service", () => {
  test("scopes membership to verified identity", async () => {
    const { service, requests } = fixture();
    expect(await service.getCurrentHousehold()).toMatchObject({
      ok: true,
      value: { defaultServings: 2 },
    });
    const query = requests.find((r) => r.url.pathname.endsWith("/household_members"));
    expect(query?.url.searchParams.get("user_id")).toBe(`eq.${userId}`);
    expect(query?.url.searchParams.get("archived_at")).toBe("is.null");
  });
  test("no membership is an expected result", async () => {
    const { service } = fixture((url) =>
      url.pathname.endsWith("/household_members") ? json([]) : undefined,
    );
    expect(await service.getCurrentHousehold()).toMatchObject({
      ok: false,
      error: { code: "no_household" },
    });
  });
  test("rejects mismatched identity", async () => {
    const { service } = fixture((url) =>
      url.pathname.endsWith("/household_members")
        ? json([{ ...membership, user_id: otherId }])
        : undefined,
    );
    expect(await service.getCurrentHousehold()).toMatchObject({
      ok: false,
      error: { code: "invalid_state" },
    });
  });
  test("does not query another household's members", async () => {
    const { service, requests } = fixture();
    expect(await service.getMembers(otherHouseholdId)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(requests.filter((r) => r.url.searchParams.has("household_id"))).toHaveLength(0);
  });
  test("rejects member scope and missing owner", async () => {
    for (const bad of [
      { ...membership, household_id: otherHouseholdId },
      { ...membership, role: "member" },
    ]) {
      const { service } = fixture((url) =>
        url.searchParams.has("household_id") ? json([bad]) : undefined,
      );
      expect(await service.getMembers(householdId)).toMatchObject({
        ok: false,
        error: { code: "invalid_state" },
      });
    }
  });
  test("maps valid members", async () => {
    expect(await fixture().service.getMembers(householdId)).toMatchObject({
      ok: true,
      value: [{ householdId, userId, role: "owner" }],
    });
  });
  test("rejects unsafe create response", async () => {
    for (const bad of [
      { ...household, archived_at: timestamp },
      { ...household, created_by_user_id: otherId },
    ]) {
      const { service } = fixture((url) =>
        url.pathname.endsWith("/rpc/create_household") ? json(bad) : undefined,
      );
      expect(await service.createHousehold(input)).toMatchObject({
        ok: false,
        error: { code: "invalid_state" },
      });
    }
  });
  test("validates input before network requests", async () => {
    const { service, requests } = fixture();
    expect(await service.createHousehold({ ...input, defaultServings: 3 })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(requests).toHaveLength(0);
  });
  test("maps expired auth and network failure without diagnostics", async () => {
    const expired = fixture((url) =>
      url.pathname.endsWith("/user")
        ? json({ code: "bad_jwt", msg: "Private diagnostic" }, 401)
        : undefined,
    );
    expect(await expired.service.getCurrentHousehold()).toMatchObject({
      ok: false,
      error: { code: "unauthenticated" },
    });
    const offline = fixture(() => json({ message: "Private diagnostic" }, 503));
    expect(await offline.service.getCurrentHousehold()).toMatchObject({
      ok: false,
      error: { code: "unavailable" },
    });
  });
  test("maps expected RPC errors", async () => {
    for (const [code, message, expected] of [
      ["23514", "User already has an active household", "already_member"],
      ["23505", "Private constraint", "conflict"],
      ["42501", "Private policy", "forbidden"],
    ]) {
      const { service } = fixture((url) =>
        url.pathname.endsWith("/rpc/create_household") ? json({ code, message }, 400) : undefined,
      );
      expect(await service.createHousehold(input)).toMatchObject({
        ok: false,
        error: { code: expected },
      });
    }
  });
  test("retry preserves normalized RPC identity", async () => {
    const { service, requests } = fixture();
    expect((await service.createHousehold(input)).ok).toBe(true);
    expect((await service.createHousehold(input)).ok).toBe(true);
    const expected = {
      household_id: householdId,
      household_name: "Our kitchen",
      household_timezone: "Europe/London",
      servings: 2,
    };
    expect(
      requests.filter((r) => r.url.pathname.endsWith("/rpc/create_household")).map((r) => r.body),
    ).toEqual([expected, expected]);
  });
});
