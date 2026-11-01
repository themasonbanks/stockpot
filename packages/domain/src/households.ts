export type HouseholdRole = "owner" | "member";
export type Household = {
  id: string;
  name: string;
  timezone: string;
  defaultServings: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
export type HouseholdMember = {
  id: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
  joinedAt: string;
};
export type HouseholdErrorCode =
  | "unauthenticated"
  | "no_household"
  | "invalid_input"
  | "already_member"
  | "forbidden"
  | "conflict"
  | "unavailable"
  | "invalid_state";
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: HouseholdErrorCode; message: string } };
export type CreateHouseholdInput = {
  requestId: string;
  name: string;
  timezone: string;
  defaultServings: number;
};
export interface HouseholdService {
  getCurrentHousehold(): Promise<Result<Household>>;
  createHousehold(input: CreateHouseholdInput): Promise<Result<Household>>;
  getMembers(householdId: string): Promise<Result<HouseholdMember[]>>;
}
export function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}
export function validateCreateHousehold(input: CreateHouseholdInput): Result<CreateHouseholdInput> {
  const invalid = (message: string): Result<CreateHouseholdInput> => ({
    ok: false,
    error: { code: "invalid_input", message },
  });
  if (
    !input ||
    !isUuid(input.requestId) ||
    typeof input.name !== "string" ||
    typeof input.timezone !== "string"
  )
    return invalid("Check household details.");
  const name = input.name.trim();
  const timezone = input.timezone.trim();
  if (
    !name ||
    [...name].length > 80 ||
    name.includes("\0") ||
    !Number.isInteger(input.defaultServings) ||
    input.defaultServings < 1 ||
    input.defaultServings > 2
  )
    return invalid("Use a name of 1–80 characters and 1–2 servings.");
  try {
    if (!timezone) throw new Error("Missing timezone");
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return invalid("Choose a recognised timezone.");
  }
  return {
    ok: true,
    value: {
      requestId: input.requestId.toLowerCase(),
      name,
      timezone,
      defaultServings: input.defaultServings,
    },
  };
}
