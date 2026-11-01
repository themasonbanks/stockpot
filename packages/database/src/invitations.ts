import { type Household, isUuid, type Result } from "@stockpot/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { mapHousehold } from "./households";
export type HouseholdInvitation = { id: string; code: string; expiresAt: string };
export type InvitationMetadata = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  acceptedAt: string | null;
};
const fail = <T>(
  code:
    | "invalid_input"
    | "unauthenticated"
    | "unavailable"
    | "forbidden"
    | "already_member"
    | "conflict",
  message: string,
): Result<T> => ({ ok: false, error: { code, message } });
function errorResult<T>(error: { code?: string; message?: string }): Result<T> {
  if (error.message === "User already has an active household")
    return fail(
      "already_member",
      "You already belong to a kitchen. Sign in with the invited account to join.",
    );
  if (error.message === "Household is full")
    return fail("invalid_input", "This kitchen already has two people.");
  if (error.code === "42501")
    return fail("forbidden", "Only the kitchen owner can manage invitations.");
  if (["40001", "40P01", "23505"].includes(error.code ?? ""))
    return fail("conflict", "The invitation changed. Please retry.");
  if (["22023", "23514"].includes(error.code ?? ""))
    return fail(
      "invalid_input",
      "This invitation is invalid, expired or no longer available. Ask the owner for a new code.",
    );
  return fail("unavailable", "We couldn’t connect. Please retry.");
}
export function createInvitationService(client: SupabaseClient<Database>) {
  async function safe<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return fail("unauthenticated", "Sign in to continue.");
      return await operation();
    } catch {
      return fail("unavailable", "We couldn’t connect. Please retry.");
    }
  }
  return {
    create: (householdId: string): Promise<Result<HouseholdInvitation>> =>
      safe(async () => {
        if (!isUuid(householdId)) return fail("invalid_input", "Choose your kitchen first.");
        const { data, error } = await client.rpc("create_household_invitation", {
          target_household_id: householdId,
        });
        if (error) return errorResult(error);
        const row = data?.[0];
        if (
          !row ||
          !isUuid(row.id) ||
          !/^[0-9A-F]{24}$/.test(row.code) ||
          !Number.isFinite(Date.parse(row.expires_at))
        )
          return fail(
            "unavailable",
            "The invitation couldn’t be prepared. Please retry to create a replacement.",
          );
        return { ok: true, value: { id: row.id, code: row.code, expiresAt: row.expires_at } };
      }),
    list: (householdId: string): Promise<Result<InvitationMetadata[]>> =>
      safe(async () => {
        const { data, error } = await client.rpc("list_household_invitations", {
          target_household_id: householdId,
        });
        if (error) return errorResult(error);
        return {
          ok: true,
          value: (data ?? []).map((row) => ({
            id: row.id,
            expiresAt: row.expires_at,
            revokedAt: row.revoked_at,
            acceptedAt: row.accepted_at,
          })),
        };
      }),
    revoke: (id: string): Promise<Result<null>> =>
      safe(async () => {
        const { error } = await client.rpc("revoke_household_invitation", {
          target_invitation_id: id,
        });
        return error ? errorResult(error) : { ok: true, value: null };
      }),
    accept: (code: string): Promise<Result<Household>> =>
      safe(async () => {
        const normalized = code.replace(/[\s-]/g, "").toUpperCase();
        if (!/^[0-9A-F]{24}$/.test(normalized))
          return fail("invalid_input", "Enter the full 24-character invitation code.");
        const { data, error } = await client.rpc("accept_household_invitation", {
          invitation_code: normalized,
        });
        return error ? errorResult(error) : mapHousehold(data);
      }),
  };
}
