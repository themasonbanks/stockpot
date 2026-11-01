import { Hono } from "hono";

export function createApp({
  readiness = async () => false,
}: {
  readiness?: () => Promise<boolean>;
} = {}) {
  const app = new Hono();

  app.get("/health", (context) => context.json({ status: "ok" }));
  app.get("/ready", async (context) => {
    context.header("Cache-Control", "no-store");
    try {
      if (await readiness()) return context.json({ status: "ready" }, 200);
    } catch {
      // Dependency exceptions never become diagnostic response bodies.
    }
    return context.json({ status: "unavailable" }, 503);
  });
  return app;
}

export const app = createApp();
