import { expect, test } from "bun:test";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  householdLocalDate,
  validateKitchenSettings,
  validatePersonalPreferences,
} from "./preferences";

test("normalizes hard rules without turning dislikes into allergies", () => {
  const result = validatePersonalPreferences({
    ...DEFAULT_PERSONAL_PREFERENCES,
    allergies: [" Peanut "],
    dislikes: ["Mushroom"],
    cuisines: [{ cuisine: "Italian", score: -1 }],
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      allergies: ["peanut"],
      dislikes: ["mushroom"],
      cuisines: [{ cuisine: "italian", score: -1 }],
    },
  });
});
test("completion needs safety review and bounded finite planner values", () => {
  for (const bad of [
    { completed: true, safetyReviewed: false },
    { maxCookMinutes: 4 },
    { maxCookMinutes: 241 },
    { maxCookMinutes: 2.5 },
    { allergies: ["peanut", "Peanut"] },
    { allergies: [false] },
    { weights: { ...DEFAULT_PERSONAL_PREFERENCES.weights, budget: NaN } },
    { weights: { ...DEFAULT_PERSONAL_PREFERENCES.weights, effort: 2 } },
  ])
    expect(validatePersonalPreferences({ ...DEFAULT_PERSONAL_PREFERENCES, ...bad }).ok).toBe(false);
  expect(
    validatePersonalPreferences({
      ...DEFAULT_PERSONAL_PREFERENCES,
      safetyReviewed: true,
      completed: true,
    }).ok,
  ).toBe(true);
});
const kitchen = {
  cadence: "weekly",
  planningDay: 0,
  timezone: "Europe/London",
  defaultServings: 2,
  equipment: ["oven", "hob"],
  equipmentNote: "",
  completed: false,
};
test("equipment and cadence validation rejects unsafe shapes", () => {
  expect(validateKitchenSettings(kitchen).ok).toBe(true);
  for (const bad of [
    { equipment: ["teleporter"] },
    { equipment: ["oven", "oven"] },
    { planningDay: 7 },
    { cadence: "whenever" },
    { defaultServings: 3 },
    { timezone: "not/a/zone" },
    { equipmentNote: "x".repeat(501) },
  ])
    expect(validateKitchenSettings({ ...kitchen, ...bad }).ok).toBe(false);
});
test("household dates follow local calendar across UTC boundaries and DST", () => {
  expect(householdLocalDate(new Date("2026-01-01T00:30:00Z"), "America/New_York")).toBe(
    "2025-12-31",
  );
  expect(householdLocalDate(new Date("2026-06-01T23:30:00Z"), "Europe/London")).toBe("2026-06-02");
  expect(householdLocalDate(new Date("2026-03-29T00:30:00Z"), "Europe/London")).toBe("2026-03-29");
});
