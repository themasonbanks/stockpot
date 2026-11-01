import { expect, test } from "bun:test";
import { inviteCodeFromUrl, normalizeInviteCode } from "./invite-link";

test("accepts only app-owned invitation links and a well-formed single code", () => {
  expect(inviteCodeFromUrl("stockpot://invite?code=0123456789abcdefabcdefab")).toBe(
    "0123456789ABCDEFABCDEFAB",
  );
  expect(inviteCodeFromUrl("http://localhost:8081/invite?code=0123456789abcdefabcdefab")).toBe(
    "0123456789ABCDEFABCDEFAB",
  );
  for (const url of [
    "https://evil.example/invite?code=0123456789abcdefabcdefab",
    "stockpot://auth/callback?code=0123456789abcdefabcdefab",
    "stockpot://invite?code=short",
    "stockpot://invite?code=0123456789abcdefabcdefab&code=0123456789abcdefabcdefab",
    "stockpot://someone@invite?code=0123456789abcdefabcdefab",
  ])
    expect(inviteCodeFromUrl(url)).toBeNull();
});
test("manual codes tolerate copy formatting without broadening the alphabet", () => {
  expect(normalizeInviteCode("012345-6789AB-CDEFAB-CDEFAB")).toBe("0123456789ABCDEFABCDEFAB");
  expect(normalizeInviteCode("0123456789GBCDEFABCDEFAB")).toBeNull();
});
