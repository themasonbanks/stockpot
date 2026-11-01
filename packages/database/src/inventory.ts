import {
  type AddLotInput,
  type AdjustLotInput,
  type FreezeLotInput,
  type Ingredient,
  type InventoryLot,
  type InventoryTransaction,
  isUuid,
  type Result,
  validateAddLotInput,
  validateAdjustLotInput,
  validateFreezeLotInput,
  validateIngredient,
  validateInventoryLot,
  validateInventoryTransaction,
} from "@stockpot/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

const failure = <T>(
  code:
    | "unauthenticated"
    | "forbidden"
    | "invalid_input"
    | "conflict"
    | "unavailable"
    | "invalid_state",
  message: string,
): Result<T> => ({ ok: false, error: { code, message } });
function databaseFailure<T>(error: { code?: string }): Result<T> {
  if (error.code === "42501")
    return failure("forbidden", "This kitchen item isn’t available to this account.");
  if (["40001", "40P01", "23505"].includes(error.code ?? ""))
    return failure(
      "conflict",
      "This item changed. Refresh your kitchen before making another correction.",
    );
  if (["22023", "23514", "23502", "22P02"].includes(error.code ?? ""))
    return failure("invalid_input", "Check the quantity, unit and date details, then try again.");
  return failure(
    "unavailable",
    "Your kitchen couldn’t be reached. Your changes are retained; please retry.",
  );
}
function decode<T>(value: unknown, validator: (v: unknown) => Result<T>): Result<T> {
  const result = validator(value);
  return result.ok
    ? result
    : failure("invalid_state", "Your kitchen data couldn’t be read safely. Please refresh.");
}
function decodeArray<T>(value: unknown, validator: (v: unknown) => Result<T>): Result<T[]> {
  if (!Array.isArray(value))
    return failure("invalid_state", "Your kitchen data couldn’t be read safely.");
  const values: T[] = [];
  for (const item of value) {
    const result = decode(item, validator);
    if (!result.ok) return result;
    values.push(result.value);
  }
  return { ok: true, value: values };
}
export function createInventoryService(client: SupabaseClient<Database>) {
  async function safe<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      const { data, error } = await client.auth.getUser();
      if (error)
        return failure(
          error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError"
            ? "unauthenticated"
            : "unavailable",
          "Your sign-in couldn’t be checked. Please retry.",
        );
      if (!data.user) return failure("unauthenticated", "Sign in to see your kitchen.");
      return await operation();
    } catch {
      return failure(
        "unavailable",
        "We couldn’t connect. Your changes are retained; please retry.",
      );
    }
  }
  async function mutate(
    householdId: string,
    input: AddLotInput | AdjustLotInput | FreezeLotInput,
    rpc: "add_inventory_lot" | "adjust_inventory_lot" | "freeze_inventory_lot",
  ): Promise<Result<InventoryLot>> {
    return safe(async () => {
      if (!isUuid(householdId)) return failure("invalid_input", "Choose your kitchen first.");
      const valid =
        rpc === "add_inventory_lot"
          ? validateAddLotInput(input as AddLotInput)
          : rpc === "adjust_inventory_lot"
            ? validateAdjustLotInput(input as AdjustLotInput)
            : validateFreezeLotInput(input as FreezeLotInput);
      if (!valid.ok) return valid;
      const { data, error } = await client.rpc(rpc, {
        target_household_id: householdId,
        payload: valid.value as unknown as Json,
      });
      if (error) return databaseFailure(error);
      const result = decode(data, validateInventoryLot);
      return result.ok && result.value.householdId !== householdId
        ? failure("invalid_state", "The kitchen response didn’t match this household.")
        : result;
    });
  }
  return {
    searchIngredients: (query: string): Promise<Result<Ingredient[]>> =>
      safe(async () => {
        if (typeof query !== "string" || [...query].length > 80)
          return failure("invalid_input", "Keep ingredient searches under 80 characters.");
        const { data, error } = await client.rpc("search_inventory_ingredients", {
          search_query: query.trim(),
        });
        return error ? databaseFailure(error) : decodeArray(data, validateIngredient);
      }),
    listLots: (householdId: string): Promise<Result<InventoryLot[]>> =>
      safe(async () => {
        if (!isUuid(householdId)) return failure("invalid_input", "Choose your kitchen first.");
        const { data, error } = await client.rpc("list_inventory_lots", {
          target_household_id: householdId,
        });
        if (error) return databaseFailure(error);
        const result = decodeArray(data, validateInventoryLot);
        return result.ok && result.value.some((lot) => lot.householdId !== householdId)
          ? failure("invalid_state", "The kitchen response didn’t match this household.")
          : result;
      }),
    addLot: (householdId: string, input: AddLotInput) =>
      mutate(householdId, input, "add_inventory_lot"),
    adjustLot: (householdId: string, input: AdjustLotInput) =>
      mutate(householdId, input, "adjust_inventory_lot"),
    freezeLot: (householdId: string, input: FreezeLotInput) =>
      mutate(householdId, input, "freeze_inventory_lot"),
    getHistory: (householdId: string, lotId: string): Promise<Result<InventoryTransaction[]>> =>
      safe(async () => {
        if (!isUuid(householdId) || !isUuid(lotId))
          return failure("invalid_input", "Choose a kitchen item first.");
        const { data, error } = await client.rpc("get_inventory_history", {
          target_household_id: householdId,
          target_lot_id: lotId,
        });
        if (error) return databaseFailure(error);
        const result = decodeArray(data, validateInventoryTransaction);
        return result.ok &&
          result.value.some((item) => item.householdId !== householdId || item.lotId !== lotId)
          ? failure("invalid_state", "The history response didn’t match this item.")
          : result;
      }),
  };
}
export type InventoryService = ReturnType<typeof createInventoryService>;
