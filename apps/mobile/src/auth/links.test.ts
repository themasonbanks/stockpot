import { expect, test } from "bun:test";
import { parseAuthLink } from "./links";

test("allows explicit PKCE routes and local web callbacks", () => {
  expect(parseAuthLink("stockpot://auth/callback?code=abc-123")).toEqual({
    kind: "code",
    code: "abc-123",
    recovery: false,
  });
  expect(parseAuthLink("stockpot://auth/recovery?code=abc_123")).toEqual({
    kind: "code",
    code: "abc_123",
    recovery: true,
  });
  expect(parseAuthLink("http://localhost:8081/auth/recovery?code=abc")).toEqual({
    kind: "code",
    code: "abc",
    recovery: true,
  });
});
test("ignores non-auth links", () => {
  for (const url of [
    null,
    "stockpot://invite?code=abc",
    "https://evil.test/auth/recovery?code=abc",
  ])
    expect(parseAuthLink(url)).toEqual({ kind: "ignore" });
});
test("rejects ambiguous, token-bearing and failed links", () => {
  for (const url of [
    "stockpot://auth/callback",
    "stockpot://auth/callback?code=one&code=two",
    "stockpot://auth/callback?code=abc&type=oauth",
    "stockpot://auth/callback?code=abc&type=signup&type=recovery",
    "stockpot://auth/callback?code=abc&error=access_denied",
    "stockpot://auth/callback#access_token=secret",
    "stockpot://auth/other?code=abc",
    "stockpot://user@auth/callback?code=abc",
    "stockpot://auth:123/callback?code=abc",
    "stockpot://auth/callback?code=%20",
  ])
    expect(parseAuthLink(url).kind).toBe("invalid");
});

test("retains explicit verifier slots and rejects ambiguous flow IDs", () => {
  expect(parseAuthLink("stockpot://auth/recovery?code=one&sb_flow_id=valid_123")).toEqual({
    kind: "code",
    code: "one",
    recovery: true,
    flowId: "valid_123",
  });
  expect(parseAuthLink("stockpot://auth/recovery?code=one&sb_flow_id=bad").kind).toBe("invalid");
  expect(
    parseAuthLink("stockpot://auth/recovery?code=one&sb_flow_id=valid_123&sb_flow_id=valid_456")
      .kind,
  ).toBe("invalid");
});
