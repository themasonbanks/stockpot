export type OnboardingStep =
  | "household"
  | "profile"
  | "personal.safety"
  | "personal.tastes"
  | "kitchen.settings"
  | "home";
export function nextOnboardingStep(data: {
  hasHousehold: boolean;
  displayName: string | null;
  personal: { completed: boolean; safetyReviewed: boolean } | null;
  kitchen: { completed: boolean } | null;
}): OnboardingStep {
  if (!data.hasHousehold) return "household";
  if (!data.displayName?.trim()) return "profile";
  if (!data.personal?.safetyReviewed) return "personal.safety";
  if (!data.personal.completed) return "personal.tastes";
  if (!data.kitchen?.completed) return "kitchen.settings";
  return "home";
}
