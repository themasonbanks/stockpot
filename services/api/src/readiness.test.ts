import { expect, test } from "bun:test";
import { createReadinessCheck } from "./readiness";

const config = { url: "http://127.0.0.1:54321", anonymousKey: "sb_publishable_disposable_test" };

test("readiness probes Auth and PostgREST without privileged headers or response data", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const ready = createReadinessCheck(config, async (url, init) => {
    calls.push({ url, init });
    return new Response("upstream content must not escape");
  });
  expect(await ready()).toBe(true);
  expect(calls.map((call) => call.url)).toEqual([
    `${config.url}/auth/v1/health`,
    `${config.url}/rest/v1/`,
  ]);
  for (const call of calls) {
    expect(call.init.headers).toEqual({ apikey: config.anonymousKey });
    expect(call.init.redirect).toBe("error");
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  }
});

test("missing configuration never probes and upstream failures make readiness false", async () => {
  let calls = 0;
  expect(
    await createReadinessCheck(null, async () => {
      calls++;
      return new Response();
    })(),
  ).toBe(false);
  expect(calls).toBe(0);
  expect(
    await createReadinessCheck(
      config,
      async (url) =>
        new Response("private upstream failure", { status: url.includes("/rest/") ? 503 : 200 }),
    )(),
  ).toBe(false);
  expect(
    await createReadinessCheck(config, async () => {
      throw new Error("private connection diagnostics");
    })(),
  ).toBe(false);
});

test("timeout settles even when fetch ignores cancellation", async () => {
  let signal: AbortSignal | null | undefined;
  const started = performance.now();
  const ready = createReadinessCheck(
    config,
    async (_url, init) => {
      signal = init.signal;
      return new Promise<Response>(() => {});
    },
    15,
  );
  expect(await ready()).toBe(false);
  expect(performance.now() - started).toBeLessThan(500);
  expect(signal?.aborted).toBe(true);
});
