import { lstat, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  assertLocalPortAvailable,
  checkMobileEnvironment,
  LocalSetupError,
  type LocalStack,
  localStack,
  mergeMobileEnvironment,
  prepareLocalInfrastructure,
  safeLocalError,
} from "./local-infrastructure";

const root = resolve(import.meta.dir, "..");
const appDirectory = join(root, "apps/mobile");
const action = process.argv[2] ?? "help";
const dockerCandidates = [
  Bun.which("docker"),
  join(homedir(), "Applications/Docker.app/Contents/Resources/bin/docker"),
  "/Applications/Docker.app/Contents/Resources/bin/docker",
];
let docker: string | undefined;
for (const candidate of dockerCandidates)
  if (candidate && (await Bun.file(candidate).exists())) {
    docker = candidate;
    break;
  }
async function run(command: string[]) {
  if (!docker)
    throw new LocalSetupError(
      "Docker was not found. Install Docker Desktop and finish its first-run setup.",
    );
  const actual =
    command[0] === "supabase"
      ? [process.execPath, "x", "--no-install", ...command]
      : [docker, ...command.slice(1)];
  const child = Bun.spawn(actual, {
    cwd: root,
    env: {
      ...process.env,
      PATH: `${dirname(docker)}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if ((await child.exited) !== 0)
    throw new LocalSetupError(
      command[0] === "docker"
        ? "Docker is installed but its engine isn’t ready. Open Docker Desktop and wait for the engine to start."
        : `Local Supabase ${command[1]} failed. Check Docker Desktop and the project’s local Supabase services.`,
    );
  return output;
}
async function readEnvironment(path: string) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink())
      throw new LocalSetupError("Local environment paths must be regular files.");
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
async function checkConfiguration(stack: LocalStack) {
  for (const name of [".env", ".env.local", ".env.development", ".env.development.local"])
    checkMobileEnvironment(await readEnvironment(join(appDirectory, name)), stack);
  for (const [key, value] of Object.entries(process.env))
    if (key.startsWith("EXPO_PUBLIC_") && value) checkMobileEnvironment(`${key}=${value}`, stack);
}
async function configure(stack: LocalStack) {
  await checkConfiguration(stack);
  const path = join(appDirectory, ".env.local");
  const current = await readEnvironment(path);
  const next = mergeMobileEnvironment(current, stack);
  if (next === current) return;
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, next, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}
async function serve(kind: "preview" | "api", stack: LocalStack) {
  const port = kind === "preview" ? 8081 : 3000;
  await assertLocalPortAvailable(port);
  const command =
    kind === "preview"
      ? [process.execPath, "run", "--cwd", "apps/mobile", "web", "--localhost", "--port", "8081"]
      : [process.execPath, "run", "--cwd", "services/api", "dev"];
  console.log(
    `${kind === "preview" ? "Stockpot preview" : "Stockpot API"}: http://localhost:${port}. Ctrl+C stops this process; local database data is retained.`,
  );
  const child = Bun.spawn(command, {
    detached: process.platform !== "win32",
    cwd: root,
    env: {
      ...process.env,
      ...(kind === "preview"
        ? {
            NODE_ENV: "development",
            EXPO_OFFLINE: "1",
            EXPO_PUBLIC_SUPABASE_URL: stack.url,
            EXPO_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
          }
        : {
            API_PORT: "3000",
            API_HOST: "127.0.0.1",
            SUPABASE_URL: stack.url,
            SUPABASE_ANON_KEY: stack.anonKey,
          }),
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const stop = (signal: NodeJS.Signals) => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch {}
  };
  const interrupt = () => stop("SIGINT");
  const terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  const code = await child.exited;
  stop("SIGTERM");
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
  process.exitCode = code === 130 || code === 143 ? 0 : code;
}
async function main() {
  if (!["setup", "preview", "api", "status", "help"].includes(action))
    throw new LocalSetupError("Unknown local command. Run bun scripts/local-cli.ts help.");
  if (action === "help") {
    console.log(
      "Stockpot local commands: local:setup (Docker, Supabase, forward migrations, public mobile config), local:preview (setup + Expo), local:api (setup + Hono), local:status (read-only checks). No command resets or stops the database. Use bun run <command>.",
    );
    return;
  }
  if (action === "status") {
    await run(["docker", "info", "--format", "{{.ServerVersion}}"]);
    const stack = localStack(await run(["supabase", "status", "-o", "json"]));
    console.log(`Docker and local Supabase are running. API: ${stack.url}.`);
    await checkConfiguration(stack);
    console.log("Mobile environment contains no conflicting local Supabase settings.");
    return;
  }
  const stack = await prepareLocalInfrastructure({ run, configure, progress: console.log });
  if (action === "preview" || action === "api") await serve(action, stack);
}
await main().catch((error) => {
  console.error(safeLocalError(error));
  process.exitCode = 1;
});
