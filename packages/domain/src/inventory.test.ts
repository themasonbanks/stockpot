import { expect, test } from "bun:test";
import {
  filterInventoryLots,
  type InventoryLot,
  inventoryExpiryLabel,
  isInventoryDate,
  normalizeInventoryQuantity,
  validateAddLotInput,
  validateAdjustLotInput,
} from "./inventory";

const req = "70000000-0000-0000-0000-000000000001";
test("normalizes within one dimension, never assumes density or piece mass", () => {
  expect(normalizeInventoryQuantity(1.25, "kg", "mass")).toEqual({ ok: true, value: 1250 });
  expect(normalizeInventoryQuantity(0.5, "l", "volume")).toEqual({ ok: true, value: 500 });
  expect(normalizeInventoryQuantity(2.5, "count", "count")).toEqual({ ok: true, value: 2.5 });
  for (const [q, u, m] of [
    [1, "ml", "mass"],
    [1, "count", "mass"],
    [-1, "g", "mass"],
    [NaN, "g", "mass"],
    [Infinity, "g", "mass"],
    [0.0001, "g", "mass"],
    [1000001, "kg", "mass"],
  ] as const)
    expect(normalizeInventoryQuantity(q, u, m).ok).toBe(false);
});
test("date and provenance validation reject invalid calendar dates and missing kinds", () => {
  for (const s of ["2026-02-29", "2026-04-31", "2026-13-01", "26-01-01", "2200-01-01"])
    expect(isInventoryDate(s)).toBe(false);
  expect(isInventoryDate("2028-02-29")).toBe(true);
  const input = {
    requestId: req,
    ingredientId: req,
    quantity: 500,
    unit: "g" as const,
    storageLocation: "fridge" as const,
    confidence: "confirmed" as const,
    expiryDate: null,
    expiryKind: null,
    note: "",
  };
  expect(validateAddLotInput(input).ok).toBe(true);
  expect(validateAddLotInput({ ...input, expiryDate: "2026-11-02" }).ok).toBe(false);
  expect(validateAddLotInput({ ...input, expiryKind: "use_by" }).ok).toBe(false);
  expect(
    validateAdjustLotInput({
      requestId: req,
      lotId: req,
      expectedVersion: 1,
      quantityBase: 0,
      confidence: "confirmed",
      reason: "Used elsewhere",
    }).ok,
  ).toBe(true);
  expect(
    validateAdjustLotInput({
      requestId: req,
      lotId: req,
      expectedVersion: 1,
      quantityBase: -1,
      confidence: "confirmed",
      reason: "Correction",
    }).ok,
  ).toBe(false);
});
const lot = {
  id: req,
  householdId: req,
  ingredient: {
    id: req,
    name: "Chicken breast",
    category: "meat",
    measurementType: "mass",
    defaultStorageLocation: "fridge",
    aliases: [],
  },
  quantityBase: 500,
  originalQuantityBase: 500,
  originalConfidence: "estimated",
  measurementType: "mass",
  storageLocation: "fridge",
  confidence: "confirmed",
  expiryDate: "2026-11-02",
  expiryKind: "use_by",
  expirySource: "packaging",
  frozenAt: null,
  createdAt: "2026-11-01T12:00:00Z",
  version: 1,
  note: "",
} satisfies InventoryLot;
test("use soon includes overdue stock without deleting it, excludes frozen and depleted lots", () => {
  expect(filterInventoryLots([lot], "use_soon", "2026-11-03")).toHaveLength(1);
  expect(inventoryExpiryLabel(lot, "2026-11-03")).toContain("date passed");
  expect(
    filterInventoryLots(
      [{ ...lot, storageLocation: "freezer", frozenAt: "2026-11-01T12:00:00Z" }],
      "use_soon",
      "2026-11-03",
    ),
  ).toHaveLength(0);
  expect(filterInventoryLots([{ ...lot, quantityBase: 0 }], "all", "2026-11-03")).toHaveLength(0);
  expect(inventoryExpiryLabel({ ...lot, storageLocation: "freezer" }, "2026-11-03")).toBe(
    "Frozen · original use by 2026-11-02",
  );
  expect(
    inventoryExpiryLabel(
      { ...lot, expiryKind: "estimated", expirySource: "user_estimate" },
      "2026-11-01",
    ),
  ).toContain("Estimated freshness");
});
