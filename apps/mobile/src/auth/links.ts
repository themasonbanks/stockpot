export const AUTH_CALLBACK_URL = "stockpot://auth/callback";
export const AUTH_RECOVERY_URL = "stockpot://auth/recovery";
export type AuthLink =
  | { kind: "ignore" }
  | { kind: "invalid"; recovery: boolean }
  | { kind: "code"; code: string; recovery: boolean };
export function parseAuthLink(input: string | null): AuthLink {
  if (!input) return { kind: "ignore" };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return /^stockpot:\/\/auth/i.test(input)
      ? { kind: "invalid", recovery: false }
      : { kind: "ignore" };
  }
  const native = url.protocol === "stockpot:" && url.hostname === "auth";
  const web =
    ["http:", "https:"].includes(url.protocol) &&
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    ["/auth/callback", "/auth/recovery"].includes(url.pathname);
  if (!native && !web) return { kind: "ignore" };
  const path = web ? url.pathname.replace(/^\/auth/, "") : url.pathname;
  const recovery = path === "/recovery" || url.searchParams.get("type") === "recovery";
  if (
    url.username ||
    url.password ||
    (native && url.port) ||
    url.hash ||
    !["/callback", "/recovery"].includes(path) ||
    ["error", "error_code", "error_description"].some((key) => url.searchParams.has(key)) ||
    url.searchParams.getAll("code").length !== 1 ||
    url.searchParams.getAll("type").length > 1
  )
    return { kind: "invalid", recovery };
  const type = url.searchParams.get("type"),
    code = url.searchParams.get("code") ?? "";
  if ((type && !["signup", "recovery"].includes(type)) || !/^[a-zA-Z0-9_-]{1,2048}$/.test(code))
    return { kind: "invalid", recovery };
  return { kind: "code", code, recovery };
}
