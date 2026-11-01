import { expect, test } from "bun:test";
import { validateCreateHousehold } from "./households";

const input = {
  requestId: "AAAAAAAA-0000-0000-0000-000000000001",
  name: " Our kitchen ",
  timezone: " Europe/London ",
  defaultServings: 2,
};
test("normalizes input without mutating caller", () => {
  expect(validateCreateHousehold(input)).toEqual({
    ok: true,
    value: {
      ...input,
      requestId: input.requestId.toLowerCase(),
      name: "Our kitchen",
      timezone: "Europe/London",
    },
  });
  expect(input.name).toBe(" Our kitchen ");
});
test("counts Unicode characters", () => {
  expect(validateCreateHousehold({ ...input, name: "🍲".repeat(80) }).ok).toBe(true);
  expect(validateCreateHousehold({ ...input, name: "🍲".repeat(81) }).ok).toBe(false);
});
test("rejects invalid fields", () => {
  for (const bad of [
    { name: " " },
    { name: "x\0y" },
    { requestId: "invalid" },
    { timezone: "" },
    { timezone: "Not/A_Timezone" },
    { defaultServings: 0 },
    { defaultServings: 3 },
    { defaultServings: 1.5 },
    { defaultServings: Number.NaN },
  ])
    expect(validateCreateHousehold({ ...input, ...bad })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
});
