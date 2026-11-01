import { expect, test } from "@playwright/test";

const api = process.env.EXPO_PUBLIC_SUPABASE_URL;
const admin = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = "Disposable-Test-Password-681!";
async function createAccount() {
  if (!api || !admin || !["127.0.0.1", "localhost"].includes(new URL(api).hostname))
    throw new Error("E2E requires disposable local Supabase; refusing a hosted database");
  const email = `stockpot-${crypto.randomUUID()}@example.com`;
  const response = await fetch(`${api}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: admin,
      Authorization: `Bearer ${admin}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!response.ok) throw new Error(`Could not prepare local test account (${response.status})`);
  return email;
}
test("sign in, create a kitchen, restore it, and isolate the next account", async ({ page }) => {
  const email = await createAccount();
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Good food starts at home.")).toBeVisible();
  await page.getByLabel("Kitchen name").fill("The shared kitchen");
  await page.getByLabel("Timezone").fill("Europe/London");
  // Server commits, but the response is lost: reload must recover the same household.
  let dropped = false;
  await page.route("**/rest/v1/rpc/create_household", async (route) => {
    if (dropped) {
      await route.continue();
      return;
    }
    dropped = true;
    await route.fetch();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Create my kitchen" }).click();
  await expect(page.getByLabel("Kitchen name")).toHaveValue("The shared kitchen");
  await page.unroute("**/rest/v1/rpc/create_household");
  await page.reload();
  await expect(page.getByText("What should we call you?")).toBeVisible();
  await page.getByLabel("Your name").fill("Alex");
  await page.getByRole("button", { name: "Continue to my kitchen" }).click();
  await expect(page.getByText("Welcome home, Alex.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Welcome home, Alex.")).toBeVisible();
  await page.screenshot({ path: "test-results/kitchen-light.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/kitchen-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  const secondEmail = await createAccount();
  await page.getByLabel("Email", { exact: true }).fill(secondEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Good food starts at home.")).toBeVisible();
  await expect(page.getByText("Welcome home, Alex.")).toHaveCount(0);
});
