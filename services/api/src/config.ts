type Environment = Record<string, string | undefined>;

export type DependencyConfig = { url: string; anonymousKey: string };

export function readListenConfig(environment: Environment) {
  const rawPort = environment.API_PORT ?? "3000";
  const hostname = environment.API_HOST ?? "127.0.0.1";
  if (
    !/^\d+$/.test(rawPort) ||
    Number(rawPort) < 1 ||
    Number(rawPort) > 65535 ||
    !["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(hostname)
  )
    throw new Error("Invalid API listen configuration.");
  return { port: Number(rawPort), hostname };
}

export function readDependencyConfig(environment: Environment): DependencyConfig | null {
  try {
    if (!environment.SUPABASE_URL || !environment.SUPABASE_ANON_KEY) return null;
    const url = new URL(environment.SUPABASE_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    const anonymousKey = environment.SUPABASE_ANON_KEY;
    if (!anonymousKey || /\s/.test(anonymousKey) || anonymousKey.startsWith("sb_secret_"))
      return null;
    if (!anonymousKey.startsWith("sb_publishable_")) {
      const parts = anonymousKey.split(".");
      if (
        parts.length !== 3 ||
        JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))).role !== "anon"
      )
        return null;
    }
    return { url: url.origin, anonymousKey };
  } catch {
    return null;
  }
}
