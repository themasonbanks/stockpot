import { expect, type Page, test } from "@playwright/test";

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
async function finishPersonal(page: Page, testResume = false) {
  await expect(page.getByText("What must we leave out?")).toBeVisible();
  await page.getByLabel("Allergies (comma separated)").fill("peanuts");
  await page
    .getByRole("checkbox", { name: "I’ve checked my allergies and dietary requirements" })
    .click();
  await page.getByRole("button", { name: "Continue to preferences" }).click();
  await expect(page.getByText("Make dinner feel like you.")).toBeVisible();
  if (testResume) {
    await page.reload();
    await expect(page.getByText("Make dinner feel like you.")).toBeVisible();
  }
  await page.getByLabel("Maximum cooking time (minutes)").fill("0");
  await page.getByRole("button", { name: "Back to dietary requirements" }).click();
  await expect(page.getByText("Make dinner feel like you.")).toBeVisible();
  await expect(page.getByText("Choose a cooking time between 5 and 240 minutes.")).toBeVisible();
  await page.getByLabel("Maximum cooking time (minutes)").fill("45");
  await page.getByRole("button", { name: "Save my food preferences" }).click();
}
async function finishKitchen(page: Page) {
  await expect(page.getByText("A rhythm that works for you.")).toBeVisible();
  await page.getByRole("checkbox", { name: "Microwave", exact: true }).click();
  await page.getByRole("button", { name: "Finish kitchen setup" }).click();
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
  let committed = false;
  await page.route("**/rest/v1/rpc/create_household", async (route) => {
    if (dropped) {
      await route.continue();
      return;
    }
    dropped = true;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    committed = true;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Create my kitchen" }).click();
  await expect.poll(() => committed).toBe(true);
  await expect(page.getByLabel("Kitchen name")).toHaveValue("The shared kitchen");
  await page.unroute("**/rest/v1/rpc/create_household");
  await page.reload();
  await expect(page.getByText("What should we call you?")).toBeVisible();
  await page.getByLabel("Your name").fill("Alex");
  await page.getByRole("button", { name: "Continue to my kitchen" }).click();
  await finishPersonal(page, true);
  await finishKitchen(page);
  await expect(page.getByText("Welcome home, Alex.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Welcome home, Alex.")).toBeVisible();
  await page.screenshot({ path: "test-results/kitchen-light.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/kitchen-dark.png", fullPage: true });
  await page.getByRole("button", { name: "Edit kitchen settings", exact: true }).click();
  await page.getByLabel("Equipment note (optional)").fill("Shared hob and oven");
  await page.getByRole("button", { name: "Save and sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Welcome home, Alex.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const secondEmail = await createAccount();
  await page.getByLabel("Email", { exact: true }).fill(secondEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Good food starts at home.")).toBeVisible();
  await expect(page.getByText("Welcome home, Alex.")).toHaveCount(0);
});

async function authenticatedAccount() {
  const email = await createAccount();
  const response = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Local test sign-in failed");
  const data = await response.json();
  return { email, token: data.access_token as string, id: data.user.id as string };
}
async function rpc(token: string, name: string, body: unknown) {
  return fetch(`${api}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function inviteFixture() {
  const owner = await authenticatedAccount(),
    household = crypto.randomUUID();
  const created = await rpc(owner.token, "create_household", {
    household_id: household,
    household_name: "Race-test kitchen",
  });
  expect(created.status).toBe(200);
  const issued = await rpc(owner.token, "create_household_invitation", {
    target_household_id: household,
  });
  expect(issued.status).toBe(200);
  const [invitation] = await issued.json();
  return { owner, household, invitation };
}
test("two recipients racing one invitation create only one membership", async () => {
  const f = await inviteFixture(),
    a = await authenticatedAccount(),
    b = await authenticatedAccount();
  const results = await Promise.all(
    [a, b].map((account) =>
      rpc(account.token, "accept_household_invitation", { invitation_code: f.invitation.code }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  const winner = results[0].ok ? a : b;
  const retry = await rpc(winner.token, "accept_household_invitation", {
    invitation_code: f.invitation.code,
  });
  expect(retry.status).toBe(200);
  const members = await fetch(
    `${api}/rest/v1/household_members?household_id=eq.${f.household}&archived_at=is.null&select=id`,
    { headers: { apikey: admin ?? "", Authorization: `Bearer ${admin}` } },
  );
  expect(members.status).toBe(200);
  expect((await members.json()).length).toBe(2);
});
test("same recipient concurrent retries are idempotent", async () => {
  const f = await inviteFixture(),
    recipient = await authenticatedAccount();
  const results = await Promise.all(
    [1, 2].map(() =>
      rpc(recipient.token, "accept_household_invitation", { invitation_code: f.invitation.code }),
    ),
  );
  expect(results.map((r) => r.status)).toEqual([200, 200]);
});
test("accept racing revocation cannot use a revoked invitation afterward", async () => {
  const f = await inviteFixture(),
    recipient = await authenticatedAccount();
  const [accepted, revoked] = await Promise.all([
    rpc(recipient.token, "accept_household_invitation", { invitation_code: f.invitation.code }),
    rpc(f.owner.token, "revoke_household_invitation", { target_invitation_id: f.invitation.id }),
  ]);
  expect(revoked.status).toBe(204);
  expect([200, 400]).toContain(accepted.status);
  const repeated = await rpc(recipient.token, "accept_household_invitation", {
    invitation_code: f.invitation.code,
  });
  expect(repeated.status).toBe(accepted.status);
});
test("accept racing archival never leaves an active member in archived kitchen", async () => {
  const f = await inviteFixture(),
    recipient = await authenticatedAccount();
  const [accepted, archived] = await Promise.all([
    rpc(recipient.token, "accept_household_invitation", { invitation_code: f.invitation.code }),
    rpc(f.owner.token, "archive_household", { target_household_id: f.household }),
  ]);
  expect(archived.status).toBe(204);
  expect([200, 400]).toContain(accepted.status);
  const members = await fetch(
    `${api}/rest/v1/household_members?household_id=eq.${f.household}&archived_at=is.null&select=id`,
    { headers: { apikey: admin ?? "", Authorization: `Bearer ${admin}` } },
  );
  expect(members.status).toBe(200);
  expect((await members.json()).length).toBe(0);
});
test("signed-out invite persists through authentication and joins once", async ({ page }) => {
  const f = await inviteFixture(),
    email = await createAccount();
  const shared = await rpc(f.owner.token, "save_kitchen_settings", {
    target_household_id: f.household,
    payload: {
      cadence: "weekly",
      planningDay: 0,
      timezone: "Europe/London",
      defaultServings: 2,
      equipment: ["oven", "hob"],
      equipmentNote: "",
      completed: true,
    },
  });
  expect(shared.status).toBe(200);
  await page.goto(`/invite?code=${f.invitation.code}`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Join kitchen", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Join kitchen", exact: true }).click();
  await expect(page.getByText("What should we call you?")).toBeVisible();
  await page.reload();
  await expect(page.getByText("What should we call you?")).toBeVisible();
  await page.getByLabel("Your name").fill("Jamie");
  await page.getByRole("button", { name: "Continue to my kitchen" }).click();
  await finishPersonal(page, true);
  await expect(page.getByText("Welcome home, Jamie.")).toBeVisible();
  await expect(page.getByText("A rhythm that works for you.")).toHaveCount(0);
  const ownerPreferences = await rpc(f.owner.token, "get_personal_preferences", {});
  expect(await ownerPreferences.json()).toBeNull();
});

test("callback refresh restores the session without reusing a one-time code", async ({ page }) => {
  if (!api) throw new Error("Missing local test API");
  const flowId = "flow_valid_123",
    storageKey = `sb-${new URL(api).hostname.split(".")[0]}-auth-token`;
  const user = {
    id: crypto.randomUUID(),
    email: "callback@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const payload = {
    sub: user.id,
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.test-signature`;
  await page.addInitScript(
    ({ key, flow }) => {
      if (!sessionStorage.getItem(`${key}-flow-${flow}-code-verifier`))
        sessionStorage.setItem(`${key}-flow-${flow}-code-verifier`, JSON.stringify("v".repeat(64)));
    },
    { key: storageKey, flow: flowId },
  );
  const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
  let exchanges = 0;
  await page.route("**/auth/v1/token?grant_type=pkce", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    exchanges++;
    await route.fulfill({
      status: exchanges === 1 ? 200 : 400,
      headers,
      json:
        exchanges === 1
          ? {
              access_token: token,
              refresh_token: "test-refresh",
              expires_in: 3600,
              token_type: "bearer",
              user,
            }
          : { error: "invalid_grant" },
    });
  });
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({ status: 200, headers, json: user }),
  );
  await page.route("**/rest/v1/household_members?**", (route) =>
    route.fulfill({ status: 200, headers, json: [] }),
  );
  await page.goto(`/auth/callback?code=one-use-code&sb_flow_id=${flowId}`);
  await expect(page.getByText("Good food starts at home.")).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:8081/");
  await page.reload();
  await expect(page.getByText("Good food starts at home.")).toBeVisible();
  expect(exchanges).toBe(1);
});
