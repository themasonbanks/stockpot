import { expect, type Page, test } from "@playwright/test";

const api = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
const password = "Disposable-Kitchen-Test-761!";
async function rpc(token: string, name: string, body: unknown) {
  return fetch(`${api}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function fixture() {
  if (
    !api ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !["localhost", "127.0.0.1"].includes(new URL(api).hostname)
  )
    throw new Error("Kitchen tests require disposable local Supabase");
  const email = `kitchen-${crypto.randomUUID()}@example.com`;
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const created = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: admin,
      Authorization: `Bearer ${admin}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Kitchen tester" },
    }),
  });
  expect(created.status).toBe(200);
  const login = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  expect(login.status).toBe(200);
  const token = (await login.json()).access_token as string;
  const household = crypto.randomUUID();
  expect(
    (
      await rpc(token, "create_household", {
        household_id: household,
        household_name: "Kitchen milestone",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await rpc(token, "save_personal_preferences", {
        payload: {
          allergies: [],
          dietaryRequirements: [],
          dislikes: [],
          cuisines: [],
          weights: { budget: 0.5, variety: 0.5, reuse: 0.5, adventure: 0.5, effort: 0.5 },
          maxCookMinutes: 30,
          safetyReviewed: true,
          completed: true,
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await rpc(token, "save_kitchen_settings", {
        target_household_id: household,
        payload: {
          cadence: "weekly",
          planningDay: 0,
          timezone: "Europe/London",
          defaultServings: 2,
          equipment: ["oven", "hob"],
          equipmentNote: "",
          completed: true,
        },
      })
    ).status,
  ).toBe(200);
  const ingredients = await rpc(token, "search_inventory_ingredients", {
    search_query: "chicken breast",
  });
  expect(ingredients.status).toBe(200);
  const [ingredient] = await ingredients.json();
  return { token, household, email, ingredient };
}
async function openKitchen(page: Page) {
  await page.getByRole("button", { name: "Open Kitchen", exact: true }).click();
  await expect(page.getByText("Your kitchen", { exact: true })).toBeVisible();
}
test("Kitchen saves recover from lost responses, corrections and freezing preserve history", async ({
  page,
}) => {
  const f = await fixture();
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(f.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await openKitchen(page);
  await expect(page.getByText("Start with what you’ve got.")).toBeVisible();
  await page.getByRole("button", { name: "Add ingredient", exact: true }).click();
  await page.getByLabel("Search ingredients").fill("chicken breast");
  await page.getByRole("button", { name: "Search catalogue" }).click();
  await page.getByRole("button", { name: "Choose chicken breast", exact: true }).click();
  await page.getByLabel("Amount", { exact: true }).fill("0.6");
  await page.getByRole("radio", { name: "Unit: kg", exact: true }).click();
  await page.getByRole("radio", { name: "Approximate amount", exact: true }).click();
  await page.getByRole("radio", { name: "Use-by from packaging", exact: true }).click();
  const today = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Date (YYYY-MM-DD)").fill(today);
  let committed = false;
  await page.route("**/rest/v1/rpc/add_inventory_lot", async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committed = true;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Add to kitchen", exact: true }).click();
  await expect.poll(() => committed).toBe(true);
  await expect(page.getByText("Finish your saved change", { exact: true })).toBeVisible();
  await page.unroute("**/rest/v1/rpc/add_inventory_lot");
  await page.reload();
  await page.getByRole("button", { name: "Open Kitchen", exact: true }).click();
  let authRejected = false;
  await page.route("**/auth/v1/user", async (route) => {
    authRejected = true;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "bad_jwt", msg: "JWT expired" }),
    });
  });
  await page.getByRole("button", { name: "Retry saved stock change", exact: true }).click();
  await expect.poll(() => authRejected).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(sessionStorage).some((key) => key.startsWith("stockpot.inventory-pending.")),
      ),
    )
    .toBe(true);
  await page.unroute("**/auth/v1/user");
  if ((await page.getByRole("button", { name: "Sign in", exact: true }).count()) === 0) {
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
  }
  await page.getByLabel("Email", { exact: true }).fill(f.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Open Kitchen", exact: true }).click();
  await page.getByRole("button", { name: "Retry saved stock change", exact: true }).click();
  await expect(page.getByText("Ingredient added to your kitchen.")).toBeVisible();
  const lots = await (
    await rpc(f.token, "list_inventory_lots", { target_household_id: f.household })
  ).json();
  expect(lots).toHaveLength(1);
  expect(lots[0].quantityBase).toBe(600);
  await page.getByRole("radio", { name: "Use soon", exact: true }).click();
  await expect(page.getByText(/About 600 g/)).toBeVisible();
  await expect(
    page.getByText(`Use-by date passed · ${today} · confirmed packaging date`),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View chicken breast lot 1", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/inventory-light.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/inventory-dark.png", fullPage: true });
  await page.getByRole("button", { name: "View chicken breast lot 1", exact: true }).click();
  await page.getByRole("button", { name: "Correct amount", exact: true }).click();
  await page.getByLabel("New remaining amount (g)").fill("350");
  await page.getByLabel("Reason for correction").fill("Checked the remaining pack");
  await page.getByRole("button", { name: "Save corrected amount", exact: true }).click();
  await expect(page.getByText("Amount corrected. Your stock history is retained.")).toBeVisible();
  await page.getByRole("button", { name: "View chicken breast lot 1", exact: true }).click();
  await page.getByRole("button", { name: "Move to freezer", exact: true }).click();
  await page.getByRole("button", { name: "Confirm move to freezer", exact: true }).click();
  await page.getByRole("radio", { name: "Use soon", exact: true }).click();
  await expect(page.getByText("Nothing in this view")).toBeVisible();
  await page.getByRole("radio", { name: "Freezer", exact: true }).click();
  await page.getByRole("button", { name: "View chicken breast lot 1", exact: true }).click();
  await expect(page.getByText(new RegExp(`original use-by date: ${today}`, "i"))).toBeVisible();
  await page.getByRole("button", { name: "Show stock history", exact: true }).click();
  await expect(page.getByText(/Amount corrected · -250 g/)).toBeVisible();
  await expect(page.getByText(/Moved to freezer · 0 g/)).toBeVisible();
  await page.getByRole("button", { name: "Correct amount", exact: true }).click();
  await page.getByLabel("New remaining amount (g)").fill("0");
  await page.getByLabel("Reason for correction").fill("Finished this lot");
  await page.getByRole("button", { name: "Save corrected amount", exact: true }).click();
  await page.getByRole("button", { name: "Show finished lots and history", exact: true }).click();
  await expect(page.getByText("No stock remaining · Freezer")).toBeVisible();
});

test("concurrent inventory retries deduplicate and stale corrections cannot overwrite", async () => {
  const f = await fixture();
  const payload = {
    requestId: crypto.randomUUID(),
    ingredientId: f.ingredient.id,
    quantity: 500,
    unit: "g",
    storageLocation: "fridge",
    confidence: "confirmed",
    expiryDate: null,
    expiryKind: null,
    note: "",
  };
  const added = await Promise.all(
    [1, 2].map(() =>
      rpc(f.token, "add_inventory_lot", { target_household_id: f.household, payload }),
    ),
  );
  expect(added.map((r) => r.status)).toEqual([200, 200]);
  const [a, b] = await Promise.all(added.map((r) => r.json()));
  expect(a.id).toBe(b.id);
  const results = await Promise.all(
    [200, 300].map((quantityBase) =>
      rpc(f.token, "adjust_inventory_lot", {
        target_household_id: f.household,
        payload: {
          requestId: crypto.randomUUID(),
          lotId: a.id,
          expectedVersion: a.version,
          quantityBase,
          confidence: "confirmed",
          reason: "Concurrent correction",
        },
      }),
    ),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  const failed = results.find((r) => !r.ok);
  if (!failed) throw new Error("Expected a conflicting correction");
  expect((await failed.json()).code).toBe("PT409");
  const history = await (
    await rpc(f.token, "get_inventory_history", {
      target_household_id: f.household,
      target_lot_id: a.id,
    })
  ).json();
  expect(history).toHaveLength(2);
});
