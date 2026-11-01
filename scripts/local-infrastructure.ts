import { createServer } from "node:net";

export class LocalSetupError extends Error {}
export async function assertLocalPortAvailable(port: number) {
  for (const host of ["127.0.0.1", "::1"])
    await new Promise<void>((resolve, reject) => {
      const server = createServer();
      server.once("error", () =>
        reject(
          new LocalSetupError(
            `Port ${port} is already in use or unavailable. The existing process was left running. Stop it yourself before starting another server.`,
          ),
        ),
      );
      server.listen({ host, port, exclusive: true }, () =>
        server.close((error) =>
          error ? reject(new LocalSetupError("The local port check could not finish.")) : resolve(),
        ),
      );
    });
}
export function safeLocalError(error: unknown) {
  return error instanceof LocalSetupError
    ? error.message
    : "Local setup failed unexpectedly. Check Docker, local configuration and available ports; existing data has not been reset.";
}
function jwtRole(value: string) {
  try {
    const parts = value.split(".");
    return parts.length === 3
      ? JSON.parse(Buffer.from(parts[1], "base64url").toString()).role
      : null;
  } catch {
    return null;
  }
}
export type LocalStack = { url: string; anonKey: string };

export function isPublicSupabaseKey(value: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split(".");
    return (
      parts.length === 3 &&
      JSON.parse(Buffer.from(parts[1], "base64url").toString()).role === "anon"
    );
  } catch {
    return false;
  }
}
export function localStack(output: string): LocalStack {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(output);
  } catch {
    throw new LocalSetupError("Couldn’t read local Supabase status.");
  }
  if (!data || typeof data.API_URL !== "string" || typeof data.ANON_KEY !== "string")
    throw new LocalSetupError("Local Supabase isn’t ready.");
  const url = new URL(data.API_URL);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !url.port
  )
    throw new LocalSetupError("Refusing a nonlocal Supabase endpoint.");
  if (!isPublicSupabaseKey(data.ANON_KEY))
    throw new LocalSetupError("Local Supabase did not return a public anonymous key.");
  return { url: data.API_URL.replace(/\/$/, ""), anonKey: data.ANON_KEY };
}

const publicKeys = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"] as const;
function assignment(line: string) {
  const matched = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
  if (!matched) return null;
  let value = matched[2];
  if (value.startsWith('"') || value.startsWith("'")) {
    const end = value.indexOf(value[0], 1);
    if (end < 0)
      throw new LocalSetupError("An environment file contains an unfinished quoted value.");
    value = value.slice(1, end);
  } else value = value.replace(/\s+#.*$/, "").trim();
  return { key: matched[1], value };
}
export function checkMobileEnvironment(contents: string, stack: LocalStack) {
  const expected = {
    EXPO_PUBLIC_SUPABASE_URL: stack.url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: stack.anonKey,
  };
  for (const line of contents.split(/\r?\n/)) {
    const item = assignment(line);
    if (!item) continue;
    if (
      item.key.startsWith("EXPO_PUBLIC_") &&
      (/^sb_secret_/.test(item.value) ||
        jwtRole(item.value) === "service_role" ||
        item.key.includes("SERVICE_ROLE"))
    )
      throw new LocalSetupError(
        "Privileged configuration must not appear in Expo public variables.",
      );
    if (item.key.startsWith("EXPO_PUBLIC_") && item.value.includes("$"))
      throw new LocalSetupError(
        "Public environment values must be literal for the local preview; resolve substitutions before continuing.",
      );
    if (!publicKeys.includes(item.key as (typeof publicKeys)[number])) continue;
    if (item.value !== expected[item.key as keyof typeof expected])
      throw new LocalSetupError(
        "Existing mobile Supabase configuration differs from the local stack. Preserve it and resolve the mismatch before continuing.",
      );
  }
}
export function mergeMobileEnvironment(contents: string, stack: LocalStack): string {
  checkMobileEnvironment(contents, stack);
  const present = new Set(
    contents
      .split(/\r?\n/)
      .map(assignment)
      .filter((item) => item !== null)
      .map((item) => item.key),
  );
  const additions: string[] = [];
  if (!present.has(publicKeys[0])) additions.push(`${publicKeys[0]}=${stack.url}`);
  if (!present.has(publicKeys[1])) additions.push(`${publicKeys[1]}=${stack.anonKey}`);
  return additions.length
    ? `${contents}${contents && !contents.endsWith("\n") ? "\n" : ""}${additions.join("\n")}\n`
    : contents;
}

export async function prepareLocalInfrastructure(dependencies: {
  run(command: string[]): Promise<string>;
  configure(stack: LocalStack): Promise<void>;
  progress(message: string): void;
}) {
  await dependencies.run(["docker", "info", "--format", "{{.ServerVersion}}"]);
  dependencies.progress("Starting local Supabase. The first launch may download images.");
  await dependencies.run(["supabase", "start"]);
  const stack = localStack(await dependencies.run(["supabase", "status", "-o", "json"]));
  dependencies.progress("Applying forward local migrations. Existing kitchen data is preserved.");
  await dependencies.run(["supabase", "migration", "up", "--local"]);
  await dependencies.configure(stack);
  dependencies.progress("Local Supabase and mobile public configuration are ready.");
  return stack;
}
