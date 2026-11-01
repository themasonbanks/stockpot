import { expect, test } from "bun:test";
import { nextOnboardingStep } from "./progress";

const base = {
  hasHousehold: true,
  displayName: "Alex",
  personal: { completed: true, safetyReviewed: true },
  kitchen: { completed: true },
};
test("resumes from persisted first incomplete data", () => {
  expect(nextOnboardingStep({ ...base, hasHousehold: false })).toBe("household");
  expect(nextOnboardingStep({ ...base, displayName: null })).toBe("profile");
  expect(nextOnboardingStep({ ...base, personal: null })).toBe("personal.safety");
  expect(
    nextOnboardingStep({ ...base, personal: { completed: false, safetyReviewed: true } }),
  ).toBe("personal.tastes");
  expect(nextOnboardingStep({ ...base, kitchen: null })).toBe("kitchen.settings");
  expect(nextOnboardingStep(base)).toBe("home");
});
test("an invited member's incomplete profile does not change shared setup", () => {
  const shared = { completed: true };
  expect(nextOnboardingStep({ ...base, kitchen: shared })).toBe("home");
  expect(
    nextOnboardingStep({ ...base, displayName: "Jamie", personal: null, kitchen: shared }),
  ).toBe("personal.safety");
  expect(shared.completed).toBe(true);
});
