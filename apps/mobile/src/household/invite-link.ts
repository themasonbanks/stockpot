export function normalizeInviteCode(value: string): string | null {
  const code = value.replace(/[\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{24}$/.test(code) ? code : null;
}
export function inviteCodeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const native =
      url.protocol === "stockpot:" &&
      url.hostname === "invite" &&
      (!url.pathname || url.pathname === "/");
    const web =
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.pathname === "/invite";
    if (
      (!native && !web) ||
      url.username ||
      url.password ||
      url.searchParams.getAll("code").length !== 1
    )
      return null;
    return normalizeInviteCode(url.searchParams.get("code") ?? "");
  } catch {
    return null;
  }
}
