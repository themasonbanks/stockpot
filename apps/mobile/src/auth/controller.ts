import type { Session } from "@stockpot/database";
import type { MobileClient } from "../lib/supabase";
import { AUTH_CALLBACK_URL, AUTH_RECOVERY_URL, parseAuthLink } from "./links";
import type { KeyValueStorage } from "./storage";
export type AuthStatus = "loading" | "signedOut" | "signedIn" | "recovery" | "error";
export type AuthState = {
  status: AuthStatus;
  session: Session | null;
  error: string | null;
  busy: boolean;
};
const GATE_KEY = "stockpot.auth.gate";
const LINK_ERROR =
  "This sign-in link is invalid or has expired. Request a new email on this device.";
const REQUEST_MESSAGE =
  "If this address can be used, you will receive an email with the next steps. Open it on this device.";
const REQUEST_ERROR = "We couldn’t complete the request. Check your connection and try again.";
function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}
function redirect(native: string) {
  return typeof window !== "undefined" &&
    ["127.0.0.1", "localhost"].includes(window.location.hostname)
    ? `${window.location.origin}/auth/${native.endsWith("recovery") ? "recovery" : "callback"}`
    : native;
}
export class AuthController {
  private state: AuthState = { status: "loading", session: null, error: null, busy: false };
  private listeners = new Set<() => void>();
  private subscription: { unsubscribe(): void } | null = null;
  private active = false;
  private booting = true;
  private recovery = false;
  private signingOut = false;
  private processingLink = false;
  private latestSession: Session | null = null;
  private revision = 0;
  private lifecycle = 0;
  private consumedCodes = new Set<string>();
  constructor(
    readonly client: MobileClient,
    private storage: KeyValueStorage,
  ) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<AuthState> = {}) {
    if (!this.active) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private settle(error: string | null = null) {
    this.publish({
      status:
        this.signingOut || this.processingLink || this.booting
          ? "loading"
          : this.recovery
            ? "recovery"
            : this.latestSession
              ? "signedIn"
              : "signedOut",
      session: this.latestSession,
      error,
    });
  }
  private block(message: string) {
    this.publish({ status: "error", error: message, busy: false });
  }
  async start(initialUrl: string | null) {
    this.subscription?.unsubscribe();
    const lifecycle = ++this.lifecycle;
    this.active = true;
    this.booting = true;
    this.publish({ status: "loading", busy: false, error: null });
    this.subscription = this.client.auth.onAuthStateChange((event, session) => {
      if (!this.active || lifecycle !== this.lifecycle) return;
      this.revision++;
      this.latestSession = session;
      if (event === "PASSWORD_RECOVERY") {
        this.recovery = true;
        queueMicrotask(() => {
          if (this.active && lifecycle === this.lifecycle)
            void this.storage
              .setItem(GATE_KEY, "recovery")
              .catch(() =>
                this.block("Recovery could not be stored safely. Please sign out and try again."),
              );
        });
      }
      this.settle();
    }).data.subscription;
    try {
      const gate = await this.storage.getItem(GATE_KEY);
      if (!this.active || lifecycle !== this.lifecycle) return;
      if (gate !== null && gate !== "recovery" && gate !== "signing-out")
        throw new Error("Invalid authentication state");
      this.recovery = gate === "recovery";
      this.signingOut = gate === "signing-out";
      if (this.signingOut) {
        this.booting = false;
        await this.signOut();
        return;
      }
      const initial = parseAuthLink(initialUrl);
      if (initial.kind !== "ignore" && initial.recovery) this.recovery = true;
      const revision = this.revision;
      const { data, error } = await this.client.auth.getSession();
      if (!this.active || lifecycle !== this.lifecycle) return;
      if (error) throw error;
      if (revision === this.revision) this.latestSession = data.session;
      if (initial.kind !== "ignore") {
        await this.handleLink(initialUrl);
        if (!this.active || lifecycle !== this.lifecycle || this.state.status === "error") return;
      }
      this.booting = false;
      this.settle();
    } catch {
      if (this.active && lifecycle === this.lifecycle) {
        this.booting = false;
        this.block("Your sign-in could not be restored. Check your connection and try again.");
      }
    }
  }
  stop() {
    this.active = false;
    this.lifecycle++;
    this.subscription?.unsubscribe();
    this.subscription = null;
  }
  async handleLink(url: string | null) {
    const link = parseAuthLink(url);
    if (
      !this.active ||
      link.kind === "ignore" ||
      (link.kind === "code" && this.consumedCodes.has(link.code)) ||
      this.processingLink
    )
      return;
    const lifecycle = this.lifecycle;
    this.processingLink = true;
    if (link.recovery) this.recovery = true;
    this.publish({ status: "loading", error: null });
    try {
      if (link.recovery) await this.storage.setItem(GATE_KEY, "recovery");
      if (!this.active || lifecycle !== this.lifecycle) return;
      if (link.kind === "invalid") throw new Error("Invalid link");
      this.consumedCodes.add(link.code);
      const { data, error } = await this.client.auth.exchangeCodeForSession(link.code);
      if (!this.active || lifecycle !== this.lifecycle) return;
      if (error || !data.session) throw new Error("Link exchange failed");
      this.latestSession = data.session;
      this.processingLink = false;
      this.settle();
    } catch {
      if (this.active && lifecycle === this.lifecycle) {
        this.processingLink = false;
        this.booting = false;
        this.block(LINK_ERROR);
      }
    }
  }
  private async action(operation: () => Promise<void>, message: string) {
    if (!this.active || this.state.busy || this.booting || this.processingLink) return false;
    const lifecycle = this.lifecycle;
    this.publish({ busy: true, error: null });
    try {
      await operation();
      if (!this.active || lifecycle !== this.lifecycle) return false;
      this.publish({ busy: false });
      return true;
    } catch {
      if (this.active && lifecycle === this.lifecycle)
        this.publish({ busy: false, error: message });
      return false;
    }
  }
  signIn = (email: string, password: string) =>
    this.action(async () => {
      const { data, error } = await this.client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) throw error ?? new Error("No session");
      this.latestSession = data.session;
      this.settle();
    }, "We couldn’t sign you in. Check your email and password, complete email verification if needed, and try again.");
  signUp = async (email: string, password: string) => {
    const ok = await this.action(async () => {
      const { data, error } = await this.client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirect(AUTH_CALLBACK_URL) },
      });
      if (error && errorCode(error) !== "user_already_exists") throw error;
      if (data.session) {
        this.latestSession = data.session;
        this.settle();
      }
    }, REQUEST_ERROR);
    return ok ? REQUEST_MESSAGE : null;
  };
  requestReset = async (email: string) => {
    const ok = await this.action(async () => {
      const { error } = await this.client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirect(AUTH_RECOVERY_URL),
      });
      if (error && errorCode(error) !== "user_not_found") throw error;
    }, REQUEST_ERROR);
    return ok ? REQUEST_MESSAGE : null;
  };
  resendVerification = async (email: string) => {
    const ok = await this.action(async () => {
      const { error } = await this.client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: redirect(AUTH_CALLBACK_URL) },
      });
      if (error && !["user_not_found", "email_already_confirmed"].includes(errorCode(error) ?? ""))
        throw error;
    }, REQUEST_ERROR);
    return ok ? REQUEST_MESSAGE : null;
  };
  updatePassword = async (password: string) => {
    if (!this.recovery || !this.latestSession) return false;
    const ok = await this.action(async () => {
      const { error } = await this.client.auth.updateUser({ password });
      if (error) throw error;
    }, "The password could not be updated. Use a new password of at least 8 characters or request another reset.");
    return ok ? this.signOut() : false;
  };
  signOut = async () => {
    if (!this.active || this.state.busy) return false;
    const lifecycle = this.lifecycle;
    this.signingOut = true;
    this.publish({ status: "loading", busy: true, error: null });
    try {
      await this.storage.setItem(GATE_KEY, "signing-out");
      const { error } = await this.client.auth.signOut({ scope: "local" });
      if (error) throw error;
      await this.storage.removeItem(GATE_KEY);
      if (!this.active || lifecycle !== this.lifecycle) return false;
      this.latestSession = null;
      this.recovery = false;
      this.signingOut = false;
      this.booting = false;
      this.publish({ busy: false });
      this.settle();
      return true;
    } catch {
      if (this.active && lifecycle === this.lifecycle)
        this.block("Sign-out could not finish safely. Check your connection and retry.");
      return false;
    }
  };
  retry = async () => {
    if (this.signingOut) await this.signOut();
    else await this.start(null);
  };
}
