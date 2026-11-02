import { expect, test } from "bun:test";
import { inventoryPendingStore, isDefinitiveInventoryRejection } from "./pending";

test("authentication and permission failures never discard an uncertain committed change", () => {
  for (const code of ["unauthenticated", "forbidden", "unavailable", "invalid_state"])
    expect(isDefinitiveInventoryRejection(code)).toBe(false);
  for (const code of ["invalid_input", "conflict"])
    expect(isDefinitiveInventoryRejection(code)).toBe(true);
});

test("uncertain stock changes survive restart and are isolated by account and kitchen", async () => {
  const data = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      data.set(key, value);
    },
    async removeItem(key: string) {
      data.delete(key);
    },
  };
  const change = {
    kind: "add" as const,
    input: { requestId: "12345678-1234-4234-8234-123456789abc", quantity: 500 },
  };
  await inventoryPendingStore(storage, "one", "kitchen").write(change);
  expect(await inventoryPendingStore(storage, "one", "kitchen").read()).toEqual(change);
  expect(await inventoryPendingStore(storage, "two", "kitchen").read()).toBeNull();
  expect(await inventoryPendingStore(storage, "one", "other").read()).toBeNull();
  await inventoryPendingStore(storage, "one", "kitchen").clear();
  expect(await inventoryPendingStore(storage, "one", "kitchen").read()).toBeNull();
});

test("storage failures prevent pretending a change was saved", async () => {
  const store = inventoryPendingStore(
    {
      async getItem() {
        return '{"kind":"add"}';
      },
      async setItem() {
        throw new Error("full");
      },
      async removeItem() {},
    },
    "one",
    "kitchen",
  );
  await expect(store.read()).rejects.toThrow("safely");
  await expect(
    store.write({ kind: "freeze", input: { requestId: "12345678-1234-4234-8234-123456789abc" } }),
  ).rejects.toThrow("full");
});
