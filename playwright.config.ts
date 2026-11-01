import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8081",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    trace: "off",
  },
  webServer: {
    command: "bun run --cwd apps/mobile web --port 8081",
    url: "http://127.0.0.1:8081",
    timeout: 120000,
    reuseExistingServer: false,
    env: { CI: "1", EXPO_NO_TELEMETRY: "1" },
  },
});
