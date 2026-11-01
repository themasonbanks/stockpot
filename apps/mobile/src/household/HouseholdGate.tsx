import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createHouseholdService,
  type Database,
  type SupabaseClient,
  type User,
} from "@stockpot/database";
import type { Household, HouseholdMember } from "@stockpot/domain";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Body, Button, Card, Field, Notice, Screen, TextLink, useTheme } from "../ui";
import { detectedTimezone, householdRequestId } from "./request";

type Props = {
  client: SupabaseClient<Database>;
  user: User;
  onSignOut: () => unknown | Promise<unknown>;
};
type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "create" }
  | { kind: "ready"; household: Household; members: HouseholdMember[]; displayName: string | null };
export function HouseholdGate({ client, user, onSignOut }: Props) {
  const service = useMemo(() => createHouseholdService(client), [client]);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [servings, setServings] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const pending = useRef(false);
  const generation = useRef(0);
  const t = useTheme();
  const load = useCallback(async () => {
    const current = ++generation.current;
    setState({ kind: "loading" });
    setError(null);
    const result = await service.getCurrentHousehold();
    if (current !== generation.current) return;
    if (!result.ok) {
      setState(
        result.error.code === "no_household"
          ? { kind: "create" }
          : { kind: "error", message: result.error.message },
      );
      return;
    }
    const [members, profile] = await Promise.all([
      service.getMembers(result.value.id),
      client.from("profiles").select("display_name").eq("id", user.id).single(),
    ]);
    if (current !== generation.current) return;
    if (!members.ok || profile.error || !profile.data) {
      setState({
        kind: "error",
        message: "We couldn’t load your kitchen. Check your connection and try again.",
      });
      return;
    }
    setState({
      kind: "ready",
      household: result.value,
      members: members.value,
      displayName: profile.data.display_name,
    });
  }, [client, service, user.id]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const create = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const current = generation.current;
    try {
      const requestId = await householdRequestId(AsyncStorage, user.id, Crypto.randomUUID);
      const result = await service.createHousehold({
        requestId,
        name,
        timezone,
        defaultServings: servings,
      });
      if (current !== generation.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await load();
    } catch {
      if (current === generation.current)
        setError("We couldn’t save your kitchen. Your details are still here; please retry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const saveName = async () => {
    const value = displayName.trim();
    if (!value || [...value].length > 80) {
      setError("Enter a name between 1 and 80 characters.");
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const current = generation.current;
    try {
      const { data, error: saveError } = await client
        .from("profiles")
        .update({ display_name: value })
        .eq("id", user.id)
        .select("display_name")
        .single();
      if (current !== generation.current) return;
      if (saveError || !data) {
        setError("Your name couldn’t be saved. Please retry.");
        return;
      }
      setState((s) => (s.kind === "ready" ? { ...s, displayName: data.display_name } : s));
    } catch {
      if (current === generation.current)
        setError("Your name couldn’t be saved. Check your connection and retry.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (state.kind === "loading")
    return (
      <Screen title="Finding your kitchen…" subtitle="Picking up where you left off.">
        <Body>Loading your household</Body>
      </Screen>
    );
  if (state.kind === "error")
    return (
      <Screen title="Let’s try that again">
        <Notice error>{state.message}</Notice>
        <Button label="Retry" onPress={load} />
        <TextLink label="Sign out" onPress={onSignOut} />
      </Screen>
    );
  if (state.kind === "create")
    return (
      <Screen
        eyebrow="YOUR KITCHEN · 1 OF 2"
        title="Good food starts at home."
        subtitle="Set up a shared kitchen for yourself or for two. Your stock, dinners and shopping will live here."
      >
        <Field
          label="Kitchen name"
          value={name}
          onChangeText={setName}
          placeholder="Alex’s kitchen"
          autoCapitalize="words"
          maxLength={80}
        />
        <Field
          label="Timezone"
          value={timezone}
          onChangeText={setTimezone}
          placeholder="Europe/London"
          autoCorrect={false}
        />
        <Body>
          Used for your local dinner and planning dates. You can correct the detected timezone.
        </Body>
        <Text style={{ color: t.textPrimary, fontSize: 15, fontWeight: "600" }}>
          Dinner servings
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              label={servings === 1 ? "1 person · selected" : "1 person"}
              secondary={servings !== 1}
              onPress={() => setServings(1)}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={servings === 2 ? "2 people · selected" : "2 people"}
              secondary={servings !== 2}
              onPress={() => setServings(2)}
            />
          </View>
        </View>
        {error ? <Notice error>{error}</Notice> : null}
        <Button label="Create my kitchen" loading={busy} disabled={!name.trim()} onPress={create} />
        <TextLink label="Sign out" onPress={onSignOut} />
      </Screen>
    );
  if (!state.displayName)
    return (
      <Screen
        eyebrow="ABOUT YOU · 2 OF 2"
        title="What should we call you?"
        subtitle="Your own profile, in your shared kitchen."
      >
        <Field
          label="Your name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoComplete="given-name"
          maxLength={80}
        />
        {error ? <Notice error>{error}</Notice> : null}
        <Button label="Continue to my kitchen" onPress={saveName} loading={busy} />
        <TextLink label="Sign out" onPress={onSignOut} />
      </Screen>
    );
  return (
    <Screen
      eyebrow={state.household.name}
      title={`Welcome home, ${state.displayName}.`}
      subtitle="A little less planning. A lot more good food."
    >
      <Card>
        <Text
          accessibilityRole="header"
          style={{ color: t.textPrimary, fontSize: 22, lineHeight: 28, fontWeight: "600" }}
        >
          Your kitchen is ready
        </Text>
        <Body>
          {state.household.defaultServings === 1 ? "Dinner for one" : "Dinner for two"} ·{" "}
          {state.household.timezone}
        </Body>
        <Body>
          {state.members.length === 1
            ? "Just you for now. Your kitchen can be shared with one other person."
            : "Two people, one shared kitchen."}
        </Body>
      </Card>
      <Body>Signed in as {user.email}</Body>
      <TextLink label="Sign out" onPress={onSignOut} />
    </Screen>
  );
}
