import { expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { createInventoryService } from "./inventory";

const id = "70000000-0000-0000-0000-000000000001";
function fixture(data: unknown, error: null | { code: string } = null, user: unknown = { id }) {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data, error };
    },
  } as unknown as SupabaseClient<Database>;
  return { service: createInventoryService(client), calls };
}
test("unauthenticated and invalid inputs never reach inventory RPCs", async () => {
  const a = fixture([], null, null);
  expect((await a.service.listLots(id)).ok).toBe(false);
  expect(a.calls).toHaveLength(0);
  const b = fixture([]);
  expect((await b.service.listLots("bad")).ok).toBe(false);
  expect(
    (
      await b.service.adjustLot(id, {
        requestId: id,
        lotId: id,
        expectedVersion: 0,
        quantityBase: -1,
        confidence: "confirmed",
        reason: "",
      })
    ).ok,
  ).toBe(false);
  expect(b.calls).toHaveLength(0);
});
test("database conflicts are typed with no raw diagnostics leakage", async () => {
  const { service } = fixture(null, { code: "40001" });
  const result = await service.freezeLot(id, { requestId: id, lotId: id, expectedVersion: 1 });
  expect(result).toMatchObject({ ok: false, error: { code: "conflict" } });
});
test("malformed or cross-household server state fails closed", async () => {
  expect(await fixture({}).service.listLots(id)).toMatchObject({
    ok: false,
    error: { code: "invalid_state" },
  });
  const lot = {
    id,
    householdId: "70000000-0000-0000-0000-000000000002",
    ingredient: {
      id,
      name: "Rice",
      category: "grain",
      measurementType: "mass",
      defaultStorageLocation: "cupboard",
      aliases: [],
    },
    quantityBase: 300,
    originalQuantityBase: 500,
    measurementType: "mass",
    storageLocation: "cupboard",
    confidence: "confirmed",
    expiryDate: null,
    expiryKind: null,
    expirySource: null,
    frozenAt: null,
    createdAt: "2026-11-01T12:00:00Z",
    version: 1,
    note: "",
  };
  expect(await fixture([lot]).service.listLots(id)).toMatchObject({
    ok: false,
    error: { code: "invalid_state" },
  });
  expect(
    await fixture([
      {
        ...lot,
        householdId: id,
        expiryDate: "2026-11-02",
        expiryKind: "use_by",
        expirySource: "user_estimate",
      },
    ]).service.listLots(id),
  ).toMatchObject({ ok: false, error: { code: "invalid_state" } });
});
test("service sends exact household and idempotency payload, never caller supplied actor", async () => {
  const { service, calls } = fixture(null, { code: "22023" });
  await service.addLot(id, {
    requestId: id,
    ingredientId: id,
    quantity: 1,
    unit: "kg",
    storageLocation: "cupboard",
    confidence: "estimated",
    expiryDate: null,
    expiryKind: null,
    note: "  rice  ",
  });
  expect(calls).toEqual([
    {
      name: "add_inventory_lot",
      args: {
        target_household_id: id,
        payload: {
          requestId: id,
          ingredientId: id,
          quantity: 1,
          unit: "kg",
          storageLocation: "cupboard",
          confidence: "estimated",
          expiryDate: null,
          expiryKind: null,
          note: "rice",
        },
      },
    },
  ]);
});
