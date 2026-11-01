import {
  createPreferencesService,
  type Database,
  type SupabaseClient,
  type User,
} from "@stockpot/database";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  EQUIPMENT_CATALOGUE,
  type Household,
  type HouseholdMember,
  type KitchenSettings,
  type PersonalPreferences,
} from "@stockpot/domain";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ManageInvitations } from "../household/Invitations";
import { usePendingInvite } from "../household/PendingInvite";
import { Body, Button, Card, Field, Notice, Screen, TextLink, useTheme } from "../ui";
import { nextOnboardingStep } from "./progress";

type Props = {
  client: SupabaseClient<Database>;
  user: User;
  household: Household;
  members: HouseholdMember[];
  displayName: string;
  onSignOut: () => unknown | Promise<unknown>;
  onRefresh: () => Promise<void>;
};
type Data = { personal: PersonalPreferences | null; kitchen: KitchenSettings | null };
function Selection({
  label,
  selected,
  onPress,
  disabled = false,
  radio = false,
  context,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
  radio?: boolean;
  context?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={radio ? "radio" : "checkbox"}
      accessibilityLabel={context ? `${context}: ${label}` : label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: t.borderControl,
        backgroundColor: selected ? t.sage : t.surface,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: selected ? t.olive : t.textPrimary, fontSize: 15, lineHeight: 22 }}>
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}
export function SetupExperience({
  client,
  user,
  household,
  members,
  displayName,
  onSignOut,
  onRefresh,
}: Props) {
  const service = useMemo(() => createPreferencesService(client), [client]);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<"personal" | "kitchen" | null>(null);
  const generation = useRef(0);
  const pending = usePendingInvite();
  const t = useTheme();
  const load = useCallback(async () => {
    const current = ++generation.current;
    setError(null);
    const [personal, kitchen] = await Promise.all([
      service.getPersonal(),
      service.getKitchen(household.id),
    ]);
    if (current !== generation.current) return;
    if (!personal.ok || !kitchen.ok) {
      setError("We couldn’t load your setup. Check your connection and retry.");
      return;
    }
    setData({ personal: personal.value, kitchen: kitchen.value });
  }, [service, household.id]);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const savePersonal = async (value: PersonalPreferences) => {
    const current = generation.current;
    const result = await service.savePersonal(value);
    if (current !== generation.current) return false;
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setError(null);
    setData((old) => (old ? { ...old, personal: result.value } : old));
    return true;
  };
  const saveKitchen = async (value: KitchenSettings) => {
    const current = generation.current;
    const result = await service.saveKitchen(household.id, value);
    if (current !== generation.current) return false;
    if (!result.ok) {
      setError(result.error.message);
      return false;
    }
    setError(null);
    setData((old) => (old ? { ...old, kitchen: result.value } : old));
    return true;
  };
  if (!data)
    return (
      <Screen title={error ? "Let’s reconnect" : "Picking up your setup…"}>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button label="Retry setup" onPress={load} />
          </>
        ) : (
          <Body>Loading your saved progress</Body>
        )}
        <TextLink label="Sign out" onPress={onSignOut} />
      </Screen>
    );
  const step = nextOnboardingStep({
    hasHousehold: true,
    displayName,
    personal: data.personal,
    kitchen: data.kitchen,
  });
  if (edit === "personal" || step === "personal.safety" || step === "personal.tastes")
    return (
      <PersonalSetup
        initial={data.personal ?? DEFAULT_PERSONAL_PREFERENCES}
        error={error}
        onSave={savePersonal}
        onDone={() => setEdit(null)}
        onExit={onSignOut}
        onBack={
          data.personal?.completed
            ? () => {
                setEdit(null);
                setError(null);
              }
            : undefined
        }
      />
    );
  if (edit === "kitchen" || !data.kitchen?.completed)
    return (
      <KitchenSetup
        initial={
          data.kitchen ?? {
            cadence: "weekly",
            planningDay: 0,
            timezone: household.timezone,
            defaultServings: household.defaultServings as 1 | 2,
            equipment: ["oven", "hob"],
            equipmentNote: "",
            completed: false,
          }
        }
        error={error}
        onSave={saveKitchen}
        onDone={() => setEdit(null)}
        onExit={onSignOut}
        onBack={() => {
          setEdit("personal");
          setError(null);
        }}
      />
    );
  return (
    <Screen
      step="home"
      eyebrow={household.name}
      title={`Welcome home, ${displayName}.`}
      subtitle="A little less planning. A lot more good food."
    >
      <Card>
        <Text
          accessibilityRole="header"
          style={{ color: t.textPrimary, fontSize: 22, fontWeight: "600" }}
        >
          Your kitchen is ready
        </Text>
        <Body>
          Dinner for {data.kitchen.defaultServings} · {data.kitchen.timezone}
        </Body>
        <Body>
          {data.kitchen.cadence === "weekly" ? "Weekly" : "Fortnightly"} planning ·{" "}
          {days[data.kitchen.planningDay]}
        </Body>
        <Body>
          {members.length === 1
            ? "Just you for now. Invite one other person to share your kitchen."
            : "Two people, one shared kitchen."}
        </Body>
      </Card>
      {error ? <Notice error>{error}</Notice> : null}
      <Button label="Refresh kitchen" secondary onPress={onRefresh} />
      <Button label="Edit my food preferences" secondary onPress={() => setEdit("personal")} />
      <Button label="Edit kitchen settings" secondary onPress={() => setEdit("kitchen")} />
      {members.some((m) => m.userId === user.id && m.role === "owner") ? (
        <ManageInvitations client={client} householdId={household.id} full={members.length >= 2} />
      ) : null}
      {pending.code ? (
        <>
          <Notice>
            You already belong to a kitchen. Cancel the saved invitation to keep this kitchen.
          </Notice>
          <TextLink
            label="Cancel saved invitation"
            onPress={async () => {
              try {
                await pending.clear();
              } catch {
                setError("The invitation couldn’t be cleared securely. Please retry.");
              }
            }}
          />
        </>
      ) : null}
      <Body>Signed in as {user.email}</Body>
      <TextLink label="Sign out" onPress={onSignOut} />
    </Screen>
  );
}
const list = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  ),
];
type PersonalProps = {
  initial: PersonalPreferences;
  error: string | null;
  onSave(value: PersonalPreferences): Promise<boolean>;
  onDone(): void;
  onExit(): unknown | Promise<unknown>;
  onBack?(): void;
};
function PersonalSetup({ initial, error, onSave, onDone, onExit, onBack }: PersonalProps) {
  const [form, setForm] = useState(initial),
    [page, setPage] = useState<"safety" | "tastes">(
      !initial.completed && initial.safetyReviewed ? "tastes" : "safety",
    ),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState<string | null>(null);
  const [allergies, setAllergies] = useState(initial.allergies.join(", ")),
    [diet, setDiet] = useState(initial.dietaryRequirements.join(", ")),
    [dislikes, setDislikes] = useState(initial.dislikes.join(", ")),
    [minutes, setMinutes] = useState(String(initial.maxCookMinutes));
  const submitted = useRef(false);
  async function save(complete: boolean, exit = false, back = false) {
    if (submitted.current) return;
    if (!/^\d+$/.test(minutes) || Number(minutes) < 5 || Number(minutes) > 240) {
      setLocalError("Choose a cooking time between 5 and 240 minutes.");
      return;
    }
    const hardChanged =
      list(allergies).join(",") !== initial.allergies.join(",") ||
      list(diet).join(",") !== initial.dietaryRequirements.join(",");
    const safetyReviewed = confirmed || (!hardChanged && form.safetyReviewed);
    if (
      (!exit && !back && page === "safety" && !confirmed) ||
      (initial.completed && !safetyReviewed)
    ) {
      setLocalError("Check your allergies and dietary requirements before saving.");
      return;
    }
    submitted.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      const value = {
        ...form,
        allergies: list(allergies),
        dietaryRequirements: list(diet),
        dislikes: list(dislikes),
        maxCookMinutes: Number(minutes),
        safetyReviewed,
        completed: complete || initial.completed,
      };
      if (await onSave(value)) {
        setForm(value);
        if (exit) await onExit();
        else if (back) onBack?.();
        else if (complete) onDone();
        else setPage("tastes");
      }
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }
  const t = useTheme();
  return (
    <Screen
      step={page === "safety" ? "personal.safety" : "personal.tastes"}
      eyebrow={page === "safety" ? "YOUR FOOD PROFILE · 1 OF 2" : "YOUR FOOD PROFILE · 2 OF 2"}
      title={page === "safety" ? "What must we leave out?" : "Make dinner feel like you."}
      subtitle={
        page === "safety"
          ? "These are your personal hard restrictions. Every household member completes their own."
          : "These are preferences, separate from allergies and dietary requirements. Sensible defaults are already selected."
      }
    >
      {page === "safety" ? (
        <>
          <Notice>
            Allergies and dietary requirements are hard rules. Ingredient dislikes are optional
            preferences on the next step.
          </Notice>
          <Field
            editable={!busy}
            label="Allergies (comma separated)"
            value={allergies}
            onChangeText={(value) => {
              setAllergies(value);
              setConfirmed(false);
            }}
            placeholder="For example, peanuts, milk"
            autoCorrect={false}
          />
          <Field
            editable={!busy}
            label="Dietary requirements (comma separated)"
            value={diet}
            onChangeText={(value) => {
              setDiet(value);
              setConfirmed(false);
            }}
            placeholder="For example, vegetarian, gluten-free"
            autoCorrect={false}
          />
          <Selection
            disabled={busy}
            label="I’ve checked my allergies and dietary requirements"
            selected={confirmed}
            onPress={() => setConfirmed(!confirmed)}
          />
          <Button
            disabled={busy || !confirmed}
            label="Continue to preferences"
            loading={busy}
            onPress={() => save(false)}
          />
        </>
      ) : (
        <>
          <Field
            editable={!busy}
            label="Ingredient dislikes (comma separated)"
            value={dislikes}
            onChangeText={setDislikes}
            placeholder="For example, mushrooms"
          />
          <Card>
            <Text
              accessibilityRole="header"
              style={{ color: t.textPrimary, fontSize: 20, fontWeight: "600" }}
            >
              Cuisines
            </Text>
            <Body>Tap to choose more often, less often or no preference.</Body>
            {["British", "Italian", "Indian", "Thai", "Mexican", "Japanese", "Mediterranean"].map(
              (cuisine) => {
                const score =
                  form.cuisines.find((v) => v.cuisine === cuisine.toLowerCase())?.score ?? 0;
                return (
                  <Button
                    disabled={busy}
                    key={cuisine}
                    label={`${cuisine}: ${score === 1 ? "More often" : score === -1 ? "Less often" : "No preference"}`}
                    secondary
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        cuisines: [
                          ...f.cuisines.filter((v) => v.cuisine !== cuisine.toLowerCase()),
                          {
                            cuisine: cuisine.toLowerCase(),
                            score: score === 0 ? 1 : score === 1 ? -1 : 0,
                          },
                        ],
                      }))
                    }
                  />
                );
              },
            )}
          </Card>
          <Card>
            <Text
              accessibilityRole="header"
              style={{ color: t.textPrimary, fontSize: 20, fontWeight: "600" }}
            >
              Your dinner balance
            </Text>
            {(
              [
                ["budget", "Spend less"],
                ["variety", "Keep meals varied"],
                ["reuse", "Reuse ingredients"],
                ["adventure", "Try something new"],
                ["effort", "Keep cooking simple"],
              ] as const
            ).map(([key, label]) => (
              <View key={key} style={{ gap: 8 }}>
                <Body>{label}</Body>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {([0, 0.5, 1] as const).map((value, i) => (
                    <View key={value} style={{ flex: 1 }}>
                      <Selection
                        disabled={busy}
                        radio
                        context={label}
                        label={["Less", "Balanced", "More"][i]}
                        selected={form.weights[key] === value}
                        onPress={() =>
                          setForm((f) => ({ ...f, weights: { ...f.weights, [key]: value } }))
                        }
                      />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </Card>
          <Field
            editable={!busy}
            label="Maximum cooking time (minutes)"
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="number-pad"
          />
          <Button
            disabled={busy}
            label="Save my food preferences"
            loading={busy}
            onPress={() => save(true)}
          />
          <TextLink
            disabled={busy}
            label="Back to dietary requirements"
            onPress={() => {
              if (!/^\d+$/.test(minutes) || Number(minutes) < 5 || Number(minutes) > 240) {
                setLocalError("Choose a cooking time between 5 and 240 minutes.");
                return;
              }
              setPage("safety");
            }}
          />
        </>
      )}
      {localError || error ? <Notice error>{localError ?? error}</Notice> : null}
      <TextLink disabled={busy} label="Save and sign out" onPress={() => save(false, true)} />
      {onBack ? (
        <TextLink
          disabled={busy}
          label="Save and return to my kitchen"
          onPress={() => save(false, false, true)}
        />
      ) : null}
    </Screen>
  );
}
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function KitchenSetup({
  initial,
  error,
  onSave,
  onDone,
  onExit,
  onBack,
}: {
  initial: KitchenSettings;
  error: string | null;
  onSave(value: KitchenSettings): Promise<boolean>;
  onDone(): void;
  onExit(): unknown | Promise<unknown>;
  onBack(): void;
}) {
  const [form, setForm] = useState(initial),
    [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const t = useTheme();
  async function save(complete: boolean, exit = false, back = false) {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    try {
      if (await onSave({ ...form, completed: complete || initial.completed })) {
        if (exit) await onExit();
        else if (back) onBack();
        else if (complete) onDone();
      }
    } finally {
      submitted.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen
      step="kitchen.settings"
      eyebrow="YOUR SHARED KITCHEN"
      title="A rhythm that works for you."
      subtitle="Planning and equipment settings are shared with everyone in this kitchen."
    >
      <Card>
        <Text
          accessibilityRole="header"
          style={{ color: t.textPrimary, fontSize: 20, fontWeight: "600" }}
        >
          Planning
        </Text>
        <Selection
          disabled={busy}
          radio
          label="Plan weekly"
          selected={form.cadence === "weekly"}
          onPress={() => setForm({ ...form, cadence: "weekly" })}
        />
        <Selection
          disabled={busy}
          radio
          label="Plan every two weeks"
          selected={form.cadence === "fortnightly"}
          onPress={() => setForm({ ...form, cadence: "fortnightly" })}
        />
        <Body>Preferred planning day</Body>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {days.map((day, index) => (
            <Selection
              disabled={busy}
              key={day}
              radio
              context="Planning day"
              label={day}
              selected={form.planningDay === index}
              onPress={() =>
                setForm({ ...form, planningDay: index as KitchenSettings["planningDay"] })
              }
            />
          ))}
        </View>
        <Field
          editable={!busy}
          label="Kitchen timezone"
          value={form.timezone}
          onChangeText={(timezone) => setForm({ ...form, timezone })}
        />
        <Body>Dates follow your kitchen’s local calendar, including daylight-saving changes.</Body>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {([1, 2] as const).map((servings) => (
            <View key={servings} style={{ flex: 1 }}>
              <Selection
                disabled={busy}
                radio
                label={`Dinner for ${servings}`}
                selected={form.defaultServings === servings}
                onPress={() => setForm({ ...form, defaultServings: servings })}
              />
            </View>
          ))}
        </View>
      </Card>
      <Card>
        <Text
          accessibilityRole="header"
          style={{ color: t.textPrimary, fontSize: 20, fontWeight: "600" }}
        >
          What’s in your kitchen?
        </Text>
        <Body>
          Oven and hob are starting suggestions. Adjust these to match the equipment you actually
          have.
        </Body>
        {EQUIPMENT_CATALOGUE.map(({ key, label }) => (
          <Selection
            disabled={busy}
            key={key}
            label={label}
            selected={form.equipment.includes(key)}
            onPress={() =>
              setForm({
                ...form,
                equipment: form.equipment.includes(key)
                  ? form.equipment.filter((item) => item !== key)
                  : [...form.equipment, key],
              })
            }
          />
        ))}
        <Field
          editable={!busy}
          label="Equipment note (optional)"
          value={form.equipmentNote}
          onChangeText={(equipmentNote) => setForm({ ...form, equipmentNote })}
          maxLength={500}
        />
      </Card>
      {error ? <Notice error>{error}</Notice> : null}
      <Button
        disabled={busy}
        label="Finish kitchen setup"
        onPress={() => save(true)}
        loading={busy}
      />
      <TextLink
        disabled={busy}
        label="Save and go back to food preferences"
        onPress={() => save(false, false, true)}
      />
      <TextLink disabled={busy} label="Save and sign out" onPress={() => save(false, true)} />
    </Screen>
  );
}
