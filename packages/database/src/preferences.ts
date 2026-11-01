import {
  isUuid,
  type KitchenSettings,
  type PersonalPreferences,
  type Result,
  validateKitchenSettings,
  validatePersonalPreferences,
} from "@stockpot/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database.types";

const failed = <T>(
  code:
    | "unauthenticated"
    | "unavailable"
    | "invalid_state"
    | "forbidden"
    | "invalid_input"
    | "conflict",
  message: string,
): Result<T> => ({ ok: false, error: { code, message } });
function databaseFailure<T>(error: { code?: string }): Result<T> {
  if (error.code === "42501")
    return failed("forbidden", "These settings aren’t available to this account.");
  if (["22023", "23514", "23502"].includes(error.code ?? ""))
    return failed("invalid_input", "Check your settings and try again.");
  if (["40001", "40P01", "23505"].includes(error.code ?? ""))
    return failed("conflict", "The settings changed. Please retry.");
  return failed(
    "unavailable",
    "Your settings couldn’t be saved or loaded. Check your connection and retry.",
  );
}
function decode<T>(value: unknown, validate: (v: unknown) => Result<T>): Result<T> {
  const parsed = validate(value);
  return parsed.ok
    ? parsed
    : failed("invalid_state", "Your saved settings couldn’t be loaded safely.");
}
export function createPreferencesService(client: SupabaseClient<Database>) {
  async function safe<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      const { data, error } = await client.auth.getUser();
      if (error)
        return failed(
          error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError"
            ? "unauthenticated"
            : "unavailable",
          "Your sign-in couldn’t be checked. Please retry.",
        );
      if (!data.user) return failed("unauthenticated", "Sign in to continue.");
      return await operation();
    } catch {
      return failed(
        "unavailable",
        "We couldn’t connect. Your changes haven’t been discarded; please retry.",
      );
    }
  }
  return {
    getPersonal: (): Promise<Result<PersonalPreferences | null>> =>
      safe(async () => {
        const { data, error } = await client.rpc("get_personal_preferences");
        if (error) return databaseFailure(error);
        return data === null
          ? { ok: true, value: null }
          : decode(data, validatePersonalPreferences);
      }),
    savePersonal: (input: PersonalPreferences): Promise<Result<PersonalPreferences>> =>
      safe(async () => {
        const valid = validatePersonalPreferences(input);
        if (!valid.ok) return valid;
        const { data, error } = await client.rpc("save_personal_preferences", {
          payload: valid.value as unknown as Json,
        });
        return error ? databaseFailure(error) : decode(data, validatePersonalPreferences);
      }),
    getKitchen: (householdId: string): Promise<Result<KitchenSettings | null>> =>
      safe(async () => {
        if (!isUuid(householdId)) return failed("invalid_input", "Choose your kitchen first.");
        const { data, error } = await client.rpc("get_kitchen_settings", {
          target_household_id: householdId,
        });
        if (error) return databaseFailure(error);
        return data === null ? { ok: true, value: null } : decode(data, validateKitchenSettings);
      }),
    saveKitchen: (householdId: string, input: KitchenSettings): Promise<Result<KitchenSettings>> =>
      safe(async () => {
        if (!isUuid(householdId)) return failed("invalid_input", "Choose your kitchen first.");
        const valid = validateKitchenSettings(input);
        if (!valid.ok) return valid;
        const { data, error } = await client.rpc("save_kitchen_settings", {
          target_household_id: householdId,
          payload: valid.value as unknown as Json,
        });
        return error ? databaseFailure(error) : decode(data, validateKitchenSettings);
      }),
  };
}
