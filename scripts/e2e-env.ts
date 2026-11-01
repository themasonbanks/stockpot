import { appendFile } from "node:fs/promises";

const child = Bun.spawn(["supabase", "status", "-o", "json"], {
  stdout: "pipe",
  stderr: "inherit",
});
const output = await new Response(child.stdout).text();
if ((await child.exited) !== 0) throw new Error("Local Supabase status failed");
const status = JSON.parse(output);
const url = status.API_URL;
if (typeof url !== "string" || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
  throw new Error("Refusing nonlocal E2E database");
if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY || !process.env.GITHUB_ENV)
  throw new Error("Missing disposable test environment");
await appendFile(
  process.env.GITHUB_ENV,
  `EXPO_PUBLIC_SUPABASE_URL=${url}\nEXPO_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\nSUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}\n`,
);
