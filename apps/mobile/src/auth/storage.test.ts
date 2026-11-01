import { describe, expect, test } from "bun:test";
import { createChunkedStorage, type KeyValueStorage } from "./storage";

function fixture() {
  const values = new Map<string, string>();
  let generation = 0;
  let failure: ((key: string, value: string) => boolean) | null = null;
  const backend: KeyValueStorage = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      if (failure?.(key, value)) throw new Error("Keychain unavailable");
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
  return {
    values,
    storage: createChunkedStorage(backend, () => `generation-${++generation}`),
    failWhen(fn: typeof failure) {
      failure = fn;
    },
  };
}
describe("secure chunk publication", () => {
  test("round trips large Unicode data with small chunks", async () => {
    const f = fixture(),
      value = "🥕界".repeat(1500);
    await f.storage.setItem("session", value);
    expect(await f.storage.getItem("session")).toBe(value);
    for (const [key, part] of f.values)
      if (!key.endsWith(".manifest"))
        expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(1600);
  });
  test("failed chunk write preserves previous session", async () => {
    const f = fixture();
    await f.storage.setItem("session", "previous");
    f.failWhen((key) => key.endsWith(".generation-2.1"));
    await expect(f.storage.setItem("session", "new".repeat(500))).rejects.toThrow();
    expect(await f.storage.getItem("session")).toBe("previous");
    expect([...f.values.keys()].some((key) => key.includes("generation-2"))).toBe(false);
  });
  test("failed manifest publication preserves previous session", async () => {
    const f = fixture();
    await f.storage.setItem("session", "previous");
    f.failWhen((key, value) => key.endsWith(".manifest") && value.includes("generation-2"));
    await expect(f.storage.setItem("session", "replacement")).rejects.toThrow();
    expect(await f.storage.getItem("session")).toBe("previous");
  });
  test("missing chunk fails closed", async () => {
    const f = fixture();
    await f.storage.setItem("session", "a".repeat(900));
    const chunk = [...f.values.keys()].find((key) => key.endsWith(".generation-1.1"));
    if (!chunk) throw new Error("Missing fixture chunk");
    f.values.delete(chunk);
    await expect(f.storage.getItem("session")).rejects.toThrow();
    expect(await f.storage.getItem("session")).toBeNull();
  });
  test("concurrent write and remove never resurrects data", async () => {
    const f = fixture();
    await Promise.all([
      f.storage.setItem("session", "first"),
      f.storage.setItem("session", "second"),
      f.storage.removeItem("session"),
    ]);
    expect(await f.storage.getItem("session")).toBeNull();
    expect(f.values.size).toBe(0);
  });
  test("session and pending invitation keys are isolated", async () => {
    const f = fixture();
    await f.storage.setItem("session", "secret");
    await f.storage.setItem("stockpot.pending-invite", "invite");
    await f.storage.removeItem("session");
    expect(await f.storage.getItem("stockpot.pending-invite")).toBe("invite");
  });
});
