import { isUuid, type Result } from "./households";
export type MeasurementType = "mass" | "volume" | "count";
export type InventoryUnit = "g" | "kg" | "ml" | "l" | "count";
export type StorageLocation = "fridge" | "freezer" | "cupboard" | "other";
export type StockConfidence = "confirmed" | "estimated";
export type ExpiryKind = "use_by" | "best_before" | "estimated";
export type Ingredient = {
  id: string;
  name: string;
  category: string;
  measurementType: MeasurementType;
  defaultStorageLocation: StorageLocation;
  aliases: string[];
};
export type InventoryLot = {
  id: string;
  householdId: string;
  ingredient: Ingredient;
  quantityBase: number;
  originalQuantityBase: number;
  measurementType: MeasurementType;
  storageLocation: StorageLocation;
  confidence: StockConfidence;
  expiryDate: string | null;
  expiryKind: ExpiryKind | null;
  expirySource: "packaging" | "user_estimate" | null;
  frozenAt: string | null;
  createdAt: string;
  version: number;
  note: string;
};
export type InventoryTransaction = {
  id: string;
  lotId: string;
  householdId: string;
  actorUserId: string;
  quantityDeltaBase: number;
  sourceType: "manual_add" | "manual_adjustment" | "freeze";
  confidence: StockConfidence;
  reason: string;
  occurredAt: string;
  requestId: string;
};
export type AddLotInput = {
  requestId: string;
  ingredientId: string;
  quantity: number;
  unit: InventoryUnit;
  storageLocation: StorageLocation;
  confidence: StockConfidence;
  expiryDate: string | null;
  expiryKind: ExpiryKind | null;
  note: string;
};
export type AdjustLotInput = {
  requestId: string;
  lotId: string;
  expectedVersion: number;
  quantityBase: number;
  confidence: StockConfidence;
  reason: string;
};
export type FreezeLotInput = { requestId: string; lotId: string; expectedVersion: number };
export type InventoryView = "all" | "use_soon" | StorageLocation;
const invalid = <T>(message: string): Result<T> => ({
  ok: false,
  error: { code: "invalid_input", message },
});
const confidence = (v: unknown): v is StockConfidence => v === "confirmed" || v === "estimated";
const location = (v: unknown): v is StorageLocation =>
  ["fridge", "freezer", "cupboard", "other"].includes(String(v));
const bounded = (n: unknown): n is number =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  n >= 0 &&
  n <= 1e9 &&
  Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function isInventoryDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
export function normalizeInventoryQuantity(
  quantity: number,
  unit: InventoryUnit,
  measurementType: MeasurementType,
): Result<number> {
  const units = {
    g: ["mass", 1],
    kg: ["mass", 1000],
    ml: ["volume", 1],
    l: ["volume", 1000],
    count: ["count", 1],
  } as const;
  const conversion = units[unit];
  if (!conversion || conversion[0] !== measurementType || !bounded(quantity))
    return invalid("Use a compatible unit and a quantity with up to three decimal places.");
  const base = Math.round(quantity * conversion[1] * 1000) / 1000;
  return bounded(base) ? { ok: true, value: base } : invalid("That quantity is too large.");
}
export function validateAddLotInput(input: AddLotInput): Result<AddLotInput> {
  if (
    !input ||
    !isUuid(input.requestId) ||
    !isUuid(input.ingredientId) ||
    !bounded(input.quantity) ||
    input.quantity <= 0 ||
    !["g", "kg", "ml", "l", "count"].includes(input.unit) ||
    !location(input.storageLocation) ||
    !confidence(input.confidence) ||
    typeof input.note !== "string" ||
    [...input.note.trim()].length > 500
  )
    return invalid("Check the ingredient, quantity and storage details.");
  if (
    input.expiryDate === null
      ? input.expiryKind !== null
      : !isInventoryDate(input.expiryDate) ||
        !["use_by", "best_before", "estimated"].includes(input.expiryKind ?? "")
  )
    return invalid("Enter a valid date and say whether it is from packaging or an estimate.");
  return { ok: true, value: { ...input, note: input.note.trim() } };
}
export function validateFreezeLotInput(input: FreezeLotInput): Result<FreezeLotInput> {
  return input &&
    isUuid(input.requestId) &&
    isUuid(input.lotId) &&
    Number.isInteger(input.expectedVersion) &&
    input.expectedVersion >= 1 &&
    input.expectedVersion <= 2147483646
    ? { ok: true, value: input }
    : invalid("Refresh this item before changing it.");
}
export function validateAdjustLotInput(input: AdjustLotInput): Result<AdjustLotInput> {
  if (
    !validateFreezeLotInput(input).ok ||
    !bounded(input.quantityBase) ||
    !confidence(input.confidence) ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    [...input.reason.trim()].length > 500
  )
    return invalid("Enter the remaining quantity and a short reason for the correction.");
  return { ok: true, value: { ...input, reason: input.reason.trim() } };
}
export function validateIngredient(value: unknown): Result<Ingredient> {
  if (
    !object(value) ||
    !isUuid(value.id) ||
    typeof value.name !== "string" ||
    !value.name ||
    typeof value.category !== "string" ||
    !["mass", "volume", "count"].includes(String(value.measurementType)) ||
    !location(value.defaultStorageLocation) ||
    !Array.isArray(value.aliases) ||
    value.aliases.some((v) => typeof v !== "string")
  )
    return invalid("Ingredient data could not be read.");
  return { ok: true, value: value as Ingredient };
}
export function validateInventoryLot(value: unknown): Result<InventoryLot> {
  if (
    !object(value) ||
    !isUuid(value.id) ||
    !isUuid(value.householdId) ||
    !validateIngredient(value.ingredient).ok ||
    !bounded(value.quantityBase) ||
    !bounded(value.originalQuantityBase) ||
    value.originalQuantityBase <= 0 ||
    !["mass", "volume", "count"].includes(String(value.measurementType)) ||
    value.measurementType !== (value.ingredient as Ingredient).measurementType ||
    !location(value.storageLocation) ||
    !confidence(value.confidence) ||
    !Number.isInteger(value.version) ||
    (value.version as number) < 1 ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.note !== "string"
  )
    return invalid("Inventory data could not be read.");
  if (
    value.expiryDate === null
      ? value.expiryKind !== null || value.expirySource !== null
      : !isInventoryDate(value.expiryDate) ||
        !["use_by", "best_before", "estimated"].includes(String(value.expiryKind)) ||
        value.expirySource !== (value.expiryKind === "estimated" ? "user_estimate" : "packaging")
  )
    return invalid("Expiry data could not be read.");
  if (
    value.frozenAt !== null &&
    (typeof value.frozenAt !== "string" ||
      !Number.isFinite(Date.parse(value.frozenAt)) ||
      value.storageLocation !== "freezer")
  )
    return invalid("Storage data could not be read.");
  return { ok: true, value: value as InventoryLot };
}
export function validateInventoryTransaction(value: unknown): Result<InventoryTransaction> {
  if (
    !object(value) ||
    ![value.id, value.lotId, value.householdId, value.actorUserId, value.requestId].every(isUuid) ||
    typeof value.quantityDeltaBase !== "number" ||
    !Number.isFinite(value.quantityDeltaBase) ||
    Math.abs(value.quantityDeltaBase) > 1e9 ||
    !["manual_add", "manual_adjustment", "freeze"].includes(String(value.sourceType)) ||
    !confidence(value.confidence) ||
    typeof value.reason !== "string" ||
    typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt))
  )
    return invalid("History data could not be read.");
  return { ok: true, value: value as InventoryTransaction };
}
export function formatInventoryQuantity(
  base: number,
  type: MeasurementType,
  certainty: StockConfidence = "confirmed",
): string {
  const unit = type === "mass" ? "g" : type === "volume" ? "ml" : "count";
  return `${certainty === "estimated" ? "About " : ""}${Number(base.toFixed(3))}${unit === "count" ? " items" : ` ${unit}`}`;
}
export function isInventoryUseSoon(lot: InventoryLot, today: string): boolean {
  if (
    lot.quantityBase <= 0 ||
    lot.storageLocation === "freezer" ||
    !lot.expiryDate ||
    !isInventoryDate(today)
  )
    return false;
  return (
    Date.parse(`${lot.expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) <= 3 * 86400000
  );
}
export function inventoryExpiryLabel(lot: InventoryLot, today: string): string {
  if (!lot.expiryDate)
    return lot.storageLocation === "freezer"
      ? "Frozen · expiry not recorded"
      : "Expiry not recorded";
  const prefix =
    lot.expiryKind === "estimated"
      ? "Estimated freshness"
      : lot.expiryKind === "use_by"
        ? "Use by"
        : "Best before";
  if (lot.storageLocation === "freezer")
    return `Frozen · original ${prefix.toLowerCase()} ${lot.expiryDate}`;
  const days = isInventoryDate(today)
    ? Math.round(
        (Date.parse(`${lot.expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000,
      )
    : null;
  return `${prefix} ${lot.expiryDate}${lot.expiryKind === "estimated" ? "" : " · confirmed packaging date"}${days === 0 ? " · today" : days !== null && days < 0 ? " · date passed" : ""}`;
}
export function filterInventoryLots(
  lots: InventoryLot[],
  view: InventoryView,
  today: string,
): InventoryLot[] {
  return lots
    .filter(
      (lot) =>
        lot.quantityBase > 0 &&
        (view === "all" ||
          (view === "use_soon" ? isInventoryUseSoon(lot, today) : lot.storageLocation === view)),
    )
    .sort(
      (a, b) =>
        (a.storageLocation === "freezer" ? "9999" : (a.expiryDate ?? "9999")).localeCompare(
          b.storageLocation === "freezer" ? "9999" : (b.expiryDate ?? "9999"),
        ) ||
        a.ingredient.name.localeCompare(b.ingredient.name) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}
