import { expect, test } from "bun:test";
import { DEFAULT_PERSONAL_PREFERENCES } from "@stockpot/domain";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { createPreferencesService } from "./preferences";

function fixture(reply: unknown = DEFAULT_PERSONAL_PREFERENCES, status = 200) {
  const requests: { url: URL; body: unknown }[] = [];
  const fake = (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(resource instanceof Request ? resource.url : String(resource));
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const user = url.pathname.endsWith("/user");
    return new Response(
      JSON.stringify(
        user
          ? {
              id: "00000000-0000-0000-0000-000000000001",
              aud: "authenticated",
              role: "authenticated",
              app_metadata: {},
              user_metadata: {},
              created_at: "2026-01-01T00:00:00Z",
            }
          : reply,
      ),
      { status: user ? 200 : status, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const client = createClient<Database>("https://stockpot.test", "public-test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer fixture" }, fetch: fake },
  });
  return { service: createPreferencesService(client), requests };
}
test("absent personal settings remain absent rather than completed defaults", async () => {
  expect(await fixture(null).service.getPersonal()).toEqual({ ok: true, value: null });
});
test("malformed persisted preferences fail closed", async () => {
  for (const reply of [
    { ...DEFAULT_PERSONAL_PREFERENCES, allergies: "peanut" },
    { ...DEFAULT_PERSONAL_PREFERENCES, completed: true, safetyReviewed: false },
  ])
    expect(await fixture(reply).service.getPersonal()).toMatchObject({
      ok: false,
      error: { code: "invalid_state" },
    });
});
test("save validates input before any mutation and sends normalized personal data only", async () => {
  const f = fixture();
  expect(
    await f.service.savePersonal({ ...DEFAULT_PERSONAL_PREFERENCES, maxCookMinutes: 0 }),
  ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  expect(f.requests.filter((r) => r.url.pathname.includes("/rpc/"))).toHaveLength(0);
  await f.service.savePersonal({ ...DEFAULT_PERSONAL_PREFERENCES, allergies: [" Peanut "] });
  expect(
    f.requests.find((r) => r.url.pathname.endsWith("/save_personal_preferences"))?.body,
  ).toMatchObject({
    payload: { allergies: ["peanut"], dislikes: [], safetyReviewed: false, completed: false },
  });
});
test("denied shared settings return safe errors without database diagnostics", async () => {
  const result = await fixture(
    { code: "42501", message: "Private policy diagnostic" },
    403,
  ).service.getKitchen("10000000-0000-0000-0000-000000000001");
  expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
  expect(JSON.stringify(result)).not.toContain("diagnostic");
});
