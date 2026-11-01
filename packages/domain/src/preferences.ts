import type { Result } from "./households";
export const EQUIPMENT_CATALOGUE = [
  { key: "oven", label: "Oven" },
  { key: "hob", label: "Hob" },
  { key: "microwave", label: "Microwave" },
  { key: "air_fryer", label: "Air fryer" },
  { key: "blender", label: "Blender" },
  { key: "food_processor", label: "Food processor" },
  { key: "slow_cooker", label: "Slow cooker" },
  { key: "pressure_cooker", label: "Pressure cooker" },
  { key: "barbecue", label: "Barbecue" },
  { key: "rice_cooker", label: "Rice cooker" },
] as const;
export type EquipmentKey = (typeof EQUIPMENT_CATALOGUE)[number]["key"];
export type PersonalPreferences = {
  allergies: string[];
  dietaryRequirements: string[];
  dislikes: string[];
  cuisines: { cuisine: string; score: -1 | 0 | 1 }[];
  weights: { budget: number; variety: number; reuse: number; adventure: number; effort: number };
  maxCookMinutes: number;
  safetyReviewed: boolean;
  completed: boolean;
};
export type KitchenSettings = {
  cadence: "weekly" | "fortnightly";
  planningDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  timezone: string;
  defaultServings: 1 | 2;
  equipment: EquipmentKey[];
  equipmentNote: string;
  completed: boolean;
};
export const DEFAULT_PERSONAL_PREFERENCES: PersonalPreferences = {
  allergies: [],
  dietaryRequirements: [],
  dislikes: [],
  cuisines: [],
  weights: { budget: 0.5, variety: 0.5, reuse: 0.5, adventure: 0.5, effort: 0.5 },
  maxCookMinutes: 30,
  safetyReviewed: false,
  completed: false,
};
export function preferenceRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function invalid<T>(): Result<T> {
  return {
    ok: false,
    error: { code: "invalid_input", message: "Check your preference settings." },
  };
}
function text(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || value.includes("\0")) return null;
  const trimmed = value.trim();
  return [...trimmed].length <= limit ? trimmed : null;
}
function list(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 40) return null;
  const result: string[] = [];
  for (const item of value) {
    const normalized = text(item, 80)?.toLowerCase();
    if (!normalized || result.includes(normalized)) return null;
    result.push(normalized);
  }
  return result;
}
export function validatePersonalPreferences(value: unknown): Result<PersonalPreferences> {
  if (!preferenceRecord(value) || !preferenceRecord(value.weights)) return invalid();
  const allergies = list(value.allergies),
    dietaryRequirements = list(value.dietaryRequirements),
    dislikes = list(value.dislikes);
  if (
    !allergies ||
    !dietaryRequirements ||
    !dislikes ||
    !Array.isArray(value.cuisines) ||
    value.cuisines.length > 40 ||
    typeof value.completed !== "boolean" ||
    typeof value.safetyReviewed !== "boolean" ||
    (value.completed && !value.safetyReviewed) ||
    typeof value.maxCookMinutes !== "number" ||
    !Number.isInteger(value.maxCookMinutes) ||
    value.maxCookMinutes < 5 ||
    value.maxCookMinutes > 240
  )
    return invalid();
  const weights = {} as PersonalPreferences["weights"];
  for (const key of ["budget", "variety", "reuse", "adventure", "effort"] as const) {
    const weight = value.weights[key];
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1)
      return invalid();
    weights[key] = weight;
  }
  const cuisines: PersonalPreferences["cuisines"] = [];
  for (const item of value.cuisines) {
    if (!preferenceRecord(item)) return invalid();
    const cuisine = text(item.cuisine, 80)?.toLowerCase();
    if (
      !cuisine ||
      (item.score !== -1 && item.score !== 0 && item.score !== 1) ||
      cuisines.some((v) => v.cuisine === cuisine)
    )
      return invalid();
    cuisines.push({ cuisine, score: item.score });
  }
  return {
    ok: true,
    value: {
      allergies,
      dietaryRequirements,
      dislikes,
      cuisines,
      weights,
      maxCookMinutes: value.maxCookMinutes,
      safetyReviewed: value.safetyReviewed,
      completed: value.completed,
    },
  };
}
export function validateKitchenSettings(value: unknown): Result<KitchenSettings> {
  if (
    !preferenceRecord(value) ||
    (value.cadence !== "weekly" && value.cadence !== "fortnightly") ||
    typeof value.planningDay !== "number" ||
    !Number.isInteger(value.planningDay) ||
    value.planningDay < 0 ||
    value.planningDay > 6 ||
    (value.defaultServings !== 1 && value.defaultServings !== 2) ||
    typeof value.completed !== "boolean" ||
    !Array.isArray(value.equipment) ||
    value.equipment.length > EQUIPMENT_CATALOGUE.length
  )
    return invalid();
  const timezone = text(value.timezone, 100),
    equipmentNote = text(value.equipmentNote, 500);
  if (!timezone || equipmentNote === null) return invalid();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
  } catch {
    return invalid();
  }
  const equipment: EquipmentKey[] = [];
  for (const item of value.equipment) {
    const known = EQUIPMENT_CATALOGUE.find((e) => e.key === item);
    if (!known || equipment.includes(known.key)) return invalid();
    equipment.push(known.key);
  }
  return {
    ok: true,
    value: {
      cadence: value.cadence,
      planningDay: value.planningDay as KitchenSettings["planningDay"],
      timezone,
      defaultServings: value.defaultServings,
      equipment,
      equipmentNote,
      completed: value.completed,
    },
  };
}
export function householdLocalDate(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)?.value)
    .join("-");
}
