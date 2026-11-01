import { describe, expect, test } from "bun:test";
import type { Session } from "@stockpot/database";
import type { MobileClient } from "../lib/supabase";
import { AuthController } from "./controller";

const SESSION = {
  access_token: "access",
  refresh_token: "refresh",
  expires_in: 3600,
  token_type: "bearer",
  user: { id: "user-a", email: "a@example.com" },
} as Session;
const GATE = "stockpot.auth.gate";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(session: Session | null = null) {
  const values = new Map<string, string>();
  const storage = {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
  let callback: ((event: string, session: Session | null) => void) | null = null;
  const result = (value: Session | null) => ({ data: { session: value }, error: null });
  const f = {
    values,
    storage,
    exchanges: 0,
    offlineSignOut: false,
    duplicateSignup: false,
    beforeExchange: () => {},
    readSession: async () => result(session),
    emit(event: string, value: Session | null) {
      callback?.(event, value);
    },
    client: null as unknown as MobileClient,
    controller: null as unknown as AuthController,
  };
  f.client = {
    auth: {
      onAuthStateChange(fn: typeof callback) {
        callback = fn;
        return {
          data: {
            subscription: {
              unsubscribe() {
                callback = null;
              },
            },
          },
        };
      },
      getSession: () => f.readSession(),
      async exchangeCodeForSession() {
        f.beforeExchange();
        f.exchanges++;
        f.emit("SIGNED_IN", SESSION);
        return result(SESSION);
      },
      async signInWithPassword() {
        f.emit("SIGNED_IN", SESSION);
        return result(SESSION);
      },
      async signUp() {
        return {
          data: { session: null },
          error: f.duplicateSignup ? { code: "user_already_exists" } : null,
        };
      },
      async resetPasswordForEmail() {
        return { error: null };
      },
      async resend() {
        return { error: null };
      },
      async updateUser() {
        return { data: { user: SESSION.user }, error: null };
      },
      async signOut() {
        if (f.offlineSignOut) return { error: new Error("Offline") };
        f.emit("SIGNED_OUT", null);
        return { error: null };
      },
    },
  } as unknown as MobileClient;
  f.controller = new AuthController(f.client, storage);
  return f;
}
describe("authentication gates", () => {
  test("stale restoration cannot replace newer auth event", async () => {
    const f = fixture(),
      read = deferred<{ data: { session: Session | null }; error: null }>(),
      reading = deferred<void>();
    f.readSession = () => {
      reading.resolve();
      return read.promise;
    };
    const start = f.controller.start(null);
    await reading.promise;
    f.emit("SIGNED_IN", SESSION);
    read.resolve({ data: { session: null }, error: null });
    await start;
    expect(f.controller.getSnapshot().status).toBe("signedIn");
    expect(f.controller.getSnapshot().session?.user.id).toBe("user-a");
  });
  test("recovery is persisted before exchange and cannot open main", async () => {
    const f = fixture(),
      statuses: string[] = [];
    f.controller.subscribe(() => statuses.push(f.controller.getSnapshot().status));
    f.beforeExchange = () => expect(f.values.get(GATE)).toBe("recovery");
    await f.controller.start("stockpot://auth/recovery?code=valid");
    expect(f.controller.getSnapshot().status).toBe("recovery");
    expect(statuses).not.toContain("signedIn");
    await f.controller.handleLink("stockpot://auth/recovery?code=valid");
    expect(f.exchanges).toBe(1);
  });
  test("recovery survives restart, password change requires fresh sign in", async () => {
    const f = fixture(SESSION);
    f.values.set(GATE, "recovery");
    await f.controller.start(null);
    expect(f.controller.getSnapshot().status).toBe("recovery");
    expect(await f.controller.updatePassword("new-password")).toBe(true);
    expect(f.controller.getSnapshot().status).toBe("signedOut");
    expect(f.values.has(GATE)).toBe(false);
  });
  test("invalid link cannot exchange or open main", async () => {
    const f = fixture();
    await f.controller.start("stockpot://auth/callback?error=expired");
    expect(f.controller.getSnapshot().status).toBe("error");
    expect(f.exchanges).toBe(0);
  });
  test("offline sign out prevents restored access until retry completes", async () => {
    const f = fixture(SESSION);
    await f.controller.start(null);
    f.offlineSignOut = true;
    expect(await f.controller.signOut()).toBe(false);
    expect(f.values.get(GATE)).toBe("signing-out");
    f.controller.stop();
    const next = new AuthController(f.client, f.storage);
    await next.start(null);
    expect(next.getSnapshot().status).toBe("error");
    f.offlineSignOut = false;
    await next.retry();
    expect(next.getSnapshot().status).toBe("signedOut");
    expect(f.values.has(GATE)).toBe(false);
  });
  test("unmounted controller ignores late restoration", async () => {
    const f = fixture(),
      read = deferred<{ data: { session: Session | null }; error: null }>(),
      reading = deferred<void>();
    f.readSession = () => {
      reading.resolve();
      return read.promise;
    };
    const start = f.controller.start(null);
    await reading.promise;
    f.controller.stop();
    read.resolve({ data: { session: SESSION }, error: null });
    await start;
    expect(f.controller.getSnapshot().status).toBe("loading");
  });
  test("signup does not reveal existing addresses", async () => {
    const f = fixture();
    await f.controller.start(null);
    const normal = await f.controller.signUp("a@example.com", "password-123");
    f.duplicateSignup = true;
    expect(await f.controller.signUp("a@example.com", "password-123")).toBe(normal);
    expect(normal).toBeTruthy();
    expect(f.controller.getSnapshot().status).toBe("signedOut");
  });
});

test("passes the callback flow ID to the SDK verifier slot", async () => {
  const f = fixture();
  const original = f.client.auth.exchangeCodeForSession.bind(f.client.auth);
  let received: string | undefined;
  f.client.auth.exchangeCodeForSession = async (code, options) => {
    received = options?.flowId;
    return original(code, options);
  };
  await f.controller.start("stockpot://auth/recovery?code=one&sb_flow_id=flow_valid123");
  expect(received).toBe("flow_valid123");
  expect(f.controller.getSnapshot().status).toBe("recovery");
});
