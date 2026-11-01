import type { User } from "@stockpot/database";
import * as Linking from "expo-linking";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ActivityIndicator, AppState } from "react-native";
import { createAuthRuntime, type MobileClient } from "../lib/supabase";
import { Button, Field, Notice, Screen, TextLink } from "../ui";
import { AuthController, type AuthState, LINK_ERROR } from "./controller";
import { parseAuthLink } from "./links";

type AuthContextValue = AuthState & {
  client: MobileClient | null;
  user: User | null;
  signIn(email: string, password: string): Promise<boolean>;
  signUp(email: string, password: string): Promise<string | null>;
  requestReset(email: string): Promise<string | null>;
  resendVerification(email: string): Promise<string | null>;
  updatePassword(password: string): Promise<boolean>;
  signOut(): Promise<boolean>;
  retry(): Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY_STATE: AuthState = { status: "loading", session: null, error: null, busy: false };
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth needs AuthProvider");
  return value;
}
function clearAuthCallbackAddress() {
  if (
    typeof window !== "undefined" &&
    window.location?.href &&
    parseAuthLink(window.location.href).kind !== "ignore"
  )
    window.history.replaceState(null, "", "/");
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [controller, setController] = useState<AuthController | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [bootComplete, setBootComplete] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally recreates a failed runtime.
  useEffect(() => {
    let active = true,
      initialized = false;
    let runtime: ReturnType<typeof createAuthRuntime> | undefined,
      current: AuthController | undefined;
    let links: ReturnType<typeof Linking.addEventListener> | undefined,
      app: ReturnType<typeof AppState.addEventListener> | undefined;
    const queued: string[] = [];
    setBootComplete(false);
    try {
      runtime = createAuthRuntime();
      current = new AuthController(runtime.client, runtime.storage);
      const auth = current,
        client = runtime.client;
      setConfigurationError(null);
      setController(auth);
      links = Linking.addEventListener("url", ({ url }) => {
        if (!initialized) queued.push(url);
        else void auth.handleLink(url);
      });
      app = AppState.addEventListener("change", (state) => {
        if (state === "active") client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      });
      if (AppState.currentState === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
      void (async () => {
        try {
          const initial = await Linking.getInitialURL();
          if (!active) return;
          await auth.start(initial);
          if (!active) return;
          // Keep the React boundary closed until recovery links queued during startup finish.
          for (const url of queued) {
            await auth.handleLink(url);
            if (!active) return;
          }
          if (auth.getSnapshot().status !== "error") clearAuthCallbackAddress();
          initialized = true;
          setBootComplete(true);
        } catch {
          if (active)
            setConfigurationError(
              "Stockpot could not open secure sign-in. Restart the app and try again.",
            );
        }
      })();
    } catch {
      setController(null);
      setConfigurationError(
        "Stockpot isn’t connected yet. Add the Supabase URL and public key to this build, then retry.",
      );
    }
    return () => {
      active = false;
      current?.stop();
      runtime?.client.auth.stopAutoRefresh();
      links?.remove();
      app?.remove();
    };
  }, [attempt]);
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => EMPTY_STATE),
    () => EMPTY_STATE,
  );
  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      ...(!bootComplete ? { status: "loading" as const } : {}),
      ...(configurationError
        ? { status: "error" as const, error: configurationError, session: null }
        : {}),
      client: configurationError ? null : (controller?.client ?? null),
      user: configurationError ? null : (state.session?.user ?? null),
      signIn: (email, password) => controller?.signIn(email, password) ?? Promise.resolve(false),
      signUp: (email, password) => controller?.signUp(email, password) ?? Promise.resolve(null),
      requestReset: (email) => controller?.requestReset(email) ?? Promise.resolve(null),
      resendVerification: (email) => controller?.resendVerification(email) ?? Promise.resolve(null),
      updatePassword: (password) => controller?.updatePassword(password) ?? Promise.resolve(false),
      signOut: async () => {
        const ok = await (controller?.signOut() ?? Promise.resolve(false));
        if (ok) clearAuthCallbackAddress();
        return ok;
      },
      retry: async () => {
        if (configurationError || !controller) setAttempt((v) => v + 1);
        else await controller.retry();
      },
    }),
    [state, bootComplete, configurationError, controller],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function AuthBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === "loading")
    return (
      <Screen title="Getting your kitchen ready" subtitle="Restoring your secure sign-in.">
        <ActivityIndicator accessibilityLabel="Restoring sign-in" />
      </Screen>
    );
  if (auth.status === "error")
    return (
      <Screen title="Let’s reconnect">
        <Notice error>{auth.error}</Notice>
        {auth.error !== LINK_ERROR ? (
          <Button label="Retry" onPress={auth.retry} loading={auth.busy} />
        ) : null}
        {auth.client ? (
          <Button label="Back to sign in" secondary onPress={auth.signOut} loading={auth.busy} />
        ) : null}
      </Screen>
    );
  if (auth.status === "recovery") return <RecoveryScreen />;
  if (auth.status !== "signedIn" || !auth.session) return <AuthScreen />;
  return <SignedInContent key={auth.session.user.id}>{children}</SignedInContent>;
}
function SignedInContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp" | "reset">("signIn");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null),
    [localError, setLocalError] = useState<string | null>(null),
    [pendingVerification, setPendingVerification] = useState(false);
  const submission = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function changeMode(next: typeof mode) {
    if (auth.busy || submission.current) return;
    setMode(next);
    setPassword("");
    setConfirmation("");
    setLocalError(null);
    setNotice(null);
    setPendingVerification(false);
  }
  async function submit() {
    if (submission.current || auth.busy) return;
    setLocalError(null);
    setNotice(null);
    if (!validEmail(email)) {
      setLocalError("Enter a valid email address.");
      return;
    }
    if (mode !== "reset" && !password) {
      setLocalError("Enter your password.");
      return;
    }
    if (mode === "signUp" && (password.length < 8 || password !== confirmation)) {
      setLocalError("Use at least 8 characters and enter the same password twice.");
      return;
    }
    submission.current = true;
    try {
      if (mode === "signIn") await auth.signIn(email, password);
      else {
        const result =
          mode === "signUp" ? await auth.signUp(email, password) : await auth.requestReset(email);
        if (mounted.current && result) {
          setNotice(result);
          setPassword("");
          setConfirmation("");
          setPendingVerification(mode === "signUp");
        }
      }
    } finally {
      submission.current = false;
    }
  }
  return (
    <Screen
      eyebrow="Make more of what you’ve got."
      title={
        mode === "signUp"
          ? "A little less planning"
          : mode === "reset"
            ? "Reset your password"
            : "Welcome to Stockpot"
      }
      subtitle={
        mode === "reset"
          ? "Request an email, then open its link on this device."
          : "Your kitchen, dinner plans and shopping, together."
      }
    >
      {notice ? <Notice>{notice}</Notice> : null}
      {localError || auth.error ? <Notice error>{localError ?? auth.error}</Notice> : null}
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!auth.busy}
      />
      {mode !== "reset" ? (
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === "signUp" ? "new-password" : "current-password"}
          autoCorrect={false}
          editable={!auth.busy}
        />
      ) : null}
      {mode === "signUp" ? (
        <Field
          label="Repeat password"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoComplete="new-password"
          autoCorrect={false}
          editable={!auth.busy}
        />
      ) : null}
      <Button
        label={
          mode === "signUp" ? "Create account" : mode === "reset" ? "Send reset email" : "Sign in"
        }
        onPress={submit}
        loading={auth.busy}
      />
      {pendingVerification ? (
        <Button
          label="Resend verification email"
          secondary
          loading={auth.busy}
          onPress={async () => {
            const result = await auth.resendVerification(email);
            if (mounted.current && result) setNotice(result);
          }}
        />
      ) : null}
      {mode === "signIn" ? (
        <>
          <TextLink label="Create an account" onPress={() => changeMode("signUp")} />
          <TextLink label="Forgot password?" onPress={() => changeMode("reset")} />
        </>
      ) : (
        <TextLink label="Back to sign in" onPress={() => changeMode("signIn")} />
      )}
    </Screen>
  );
}
function RecoveryScreen() {
  const auth = useAuth();
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  async function update() {
    if (submitting.current || auth.busy) return;
    if (password.length < 8 || password !== confirmation) {
      setError("Use at least 8 characters and enter the same password twice.");
      return;
    }
    setError(null);
    submitting.current = true;
    try {
      await auth.updatePassword(password);
    } finally {
      submitting.current = false;
    }
  }
  return (
    <Screen
      title="Choose a new password"
      subtitle="After saving, sign in again with your new password."
    >
      {!auth.session ? (
        <Notice error>
          This recovery session has expired. Return to sign in and request a new reset email.
        </Notice>
      ) : (
        <>
          {error || auth.error ? <Notice error>{error ?? auth.error}</Notice> : null}
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            autoCorrect={false}
            editable={!auth.busy}
          />
          <Field
            label="Repeat new password"
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry
            autoComplete="new-password"
            autoCorrect={false}
            editable={!auth.busy}
          />
          <Button label="Save new password" onPress={update} loading={auth.busy} />
        </>
      )}
      <Button label="Back to sign in" secondary onPress={auth.signOut} loading={auth.busy} />
    </Screen>
  );
}
