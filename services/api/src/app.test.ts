import { describe, expect, test } from "bun:test";

import { app, createApp } from "./app";

describe("GET /health", () => {
  test("reports a healthy service", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

test("readiness is separate from liveness and never exposes upstream exceptions", async () => {
  const unready = createApp({
    readiness: async () => {
      throw new Error("credential or private upstream body");
    },
  });
  const health = await unready.request("/health");
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  const unavailable = await unready.request("/ready");
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ status: "unavailable" });
  expect(unavailable.headers.get("cache-control")).toBe("no-store");
  const ready = await createApp({ readiness: async () => true }).request("/ready");
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: "ready" });
  expect(ready.headers.get("cache-control")).toBe("no-store");
  expect((await app.request("/ready")).status).toBe(503);
});
