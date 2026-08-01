import { describe, expect, test } from "bun:test";

import { app } from "./app";

describe("GET /health", () => {
  test("reports a healthy service", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
