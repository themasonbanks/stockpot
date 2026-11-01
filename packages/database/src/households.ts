import {
  type CreateHouseholdInput,
  type Household,
  type HouseholdErrorCode,
  type HouseholdMember,
  type HouseholdService,
  isUuid,
  type Result,
  validateCreateHousehold,
} from "@stockpot/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type HouseholdRow = Database["public"]["Tables"]["households"]["Row"];
type MemberRow = Database["public"]["Tables"]["household_members"]["Row"];
const messages: Record<HouseholdErrorCode, string> = {
  unauthenticated: "Sign in to continue.",
  no_household: "Create or join a household to continue.",
  invalid_input: "Check household details.",
  already_member: "You already belong to a household.",
  forbidden: "You cannot access this household.",
  conflict: "The household changed. Please retry.",
  unavailable: "Stockpot could not connect. Please try again.",
  invalid_state: "Household data could not be loaded safely.",
};
function failure<T>(code: HouseholdErrorCode): Result<T> {
  return { ok: false, error: { code, message: messages[code] } };
}
function databaseFailure<T>(error: { code: string; message: string }): Result<T> {
  if (["PGRST301", "PGRST302", "28000", "28P01"].includes(error.code))
    return failure("unauthenticated");
  if (error.code === "42501") return failure("forbidden");
  if (["23505", "40001", "40P01"].includes(error.code)) return failure("conflict");
  if (error.code === "23514" && error.message === "User already has an active household")
    return failure("already_member");
  if (["22023", "23502", "23514", "22P02"].includes(error.code)) return failure("invalid_input");
  if (error.code === "23503") return failure("invalid_state");
  return failure("unavailable");
}
function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function mapHousehold(row: HouseholdRow | null): Result<Household> {
  if (
    !row ||
    row.archived_at !== null ||
    !isUuid(row.created_by_user_id) ||
    !validTimestamp(row.created_at) ||
    !validTimestamp(row.updated_at) ||
    Date.parse(row.updated_at) < Date.parse(row.created_at)
  )
    return failure("invalid_state");
  const valid = validateCreateHousehold({
    requestId: row.id,
    name: row.name,
    timezone: row.timezone,
    defaultServings: row.default_servings,
  });
  if (!valid.ok || valid.value.name !== row.name || valid.value.timezone !== row.timezone)
    return failure("invalid_state");
  return {
    ok: true,
    value: {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      defaultServings: row.default_servings,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}
function member(row: MemberRow): Result<HouseholdMember> {
  if (
    !row ||
    row.archived_at !== null ||
    !isUuid(row.id) ||
    !isUuid(row.household_id) ||
    !isUuid(row.user_id) ||
    (row.role !== "owner" && row.role !== "member") ||
    !validTimestamp(row.joined_at)
  )
    return failure("invalid_state");
  return {
    ok: true,
    value: {
      id: row.id,
      householdId: row.household_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: row.joined_at,
    },
  };
}
/** Use a caller-authenticated client. RLS remains the security boundary. */
export function createHouseholdService(client: SupabaseClient<Database>): HouseholdService {
  async function identity(): Promise<Result<string>> {
    const { data, error } = await client.auth.getUser();
    if (error)
      return failure(
        error.status === 401 || error.status === 403 || error.name === "AuthSessionMissingError"
          ? "unauthenticated"
          : "unavailable",
      );
    if (!data.user || !isUuid(data.user.id)) return failure("unauthenticated");
    return { ok: true, value: data.user.id };
  }
  async function current(userId: string): Promise<Result<Household>> {
    const membership = await client
      .from("household_members")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .limit(2);
    if (membership.error) return databaseFailure(membership.error);
    if (!membership.data?.length) return failure("no_household");
    if (membership.data.length !== 1) return failure("invalid_state");
    const own = member(membership.data[0]);
    if (!own.ok || own.value.userId !== userId) return failure("invalid_state");
    const result = await client
      .from("households")
      .select("*")
      .eq("id", own.value.householdId)
      .is("archived_at", null)
      .limit(2);
    if (result.error) return databaseFailure(result.error);
    if (result.data?.length !== 1) return failure("invalid_state");
    const mapped = mapHousehold(result.data[0]);
    return mapped.ok && mapped.value.id !== own.value.householdId
      ? failure("invalid_state")
      : mapped;
  }
  async function safe<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await operation();
    } catch {
      return failure("unavailable");
    }
  }
  return {
    getCurrentHousehold: () =>
      safe(async () => {
        const user = await identity();
        return user.ok ? current(user.value) : user;
      }),
    createHousehold: (input: CreateHouseholdInput) =>
      safe(async () => {
        const valid = validateCreateHousehold(input);
        if (!valid.ok) return valid;
        const user = await identity();
        if (!user.ok) return user;
        const result = await client.rpc("create_household", {
          household_id: valid.value.requestId,
          household_name: valid.value.name,
          household_timezone: valid.value.timezone,
          servings: valid.value.defaultServings,
        });
        if (result.error) return databaseFailure(result.error);
        const mapped = mapHousehold(result.data);
        if (
          !mapped.ok ||
          mapped.value.id !== valid.value.requestId ||
          mapped.value.createdByUserId !== user.value
        )
          return failure("invalid_state");
        return mapped;
      }),
    getMembers: (householdId: string) =>
      safe(async () => {
        if (!isUuid(householdId)) return failure("invalid_input");
        const user = await identity();
        if (!user.ok) return user;
        const own = await current(user.value);
        if (!own.ok) return own;
        if (own.value.id !== householdId.toLowerCase()) return failure("forbidden");
        const result = await client
          .from("household_members")
          .select("*")
          .eq("household_id", own.value.id)
          .is("archived_at", null)
          .order("joined_at")
          .order("id")
          .limit(3);
        if (result.error) return databaseFailure(result.error);
        if (!result.data || result.data.length < 1 || result.data.length > 2)
          return failure("invalid_state");
        const members: HouseholdMember[] = [];
        for (const row of result.data) {
          const mapped = member(row);
          if (!mapped.ok || mapped.value.householdId !== own.value.id)
            return failure("invalid_state");
          members.push(mapped.value);
        }
        if (
          !members.some((v) => v.userId === user.value) ||
          !members.some((v) => v.role === "owner") ||
          new Set(members.map((v) => v.id)).size !== members.length ||
          new Set(members.map((v) => v.userId)).size !== members.length
        )
          return failure("invalid_state");
        return { ok: true, value: members };
      }),
  };
}
