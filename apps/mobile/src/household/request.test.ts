import { describe, expect, test } from "bun:test";
import { householdRequestId } from "./request";

describe("household creation identity", () => {
  test("persists the same operation across retries and isolates accounts", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const first = "10000000-0000-4000-8000-000000000001";
    const second = "10000000-0000-4000-8000-000000000002";
    expect(await householdRequestId(storage, "alex", () => first)).toBe(first);
    expect(await householdRequestId(storage, "alex", () => second)).toBe(first);
    expect(await householdRequestId(storage, "jamie", () => second)).toBe(second);
  });
  test("does not submit if durable storage fails", async () => {
    const storage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("storage unavailable");
      },
    };
    await expect(
      householdRequestId(storage, "alex", () => "10000000-0000-4000-8000-000000000001"),
    ).rejects.toThrow("storage unavailable");
  });
});
