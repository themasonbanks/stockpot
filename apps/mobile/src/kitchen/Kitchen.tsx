import { createInventoryService, type Database, type SupabaseClient } from "@stockpot/database";
import {
  type AddLotInput,
  type AdjustLotInput,
  type FreezeLotInput,
  filterInventoryLots,
  formatInventoryQuantity,
  type Household,
  householdLocalDate,
  type Ingredient,
  type InventoryLot,
  type InventoryTransaction,
  inventoryExpiryLabel,
} from "@stockpot/domain";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { authStorage } from "../lib/storage";
import { Body, Button, Card, Field, Notice, Screen, TextLink, useTheme } from "../ui";
import {
  inventoryPendingStore,
  isDefinitiveInventoryRejection,
  type PendingChange,
} from "./pending";

function Choice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress(): void;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        padding: 12,
        borderWidth: 1,
        borderColor: t.borderControl,
        borderRadius: 12,
        backgroundColor: selected ? t.sage : t.surface,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: selected ? t.olive : t.textPrimary, fontSize: 15 }}>
        {selected ? "✓ " : ""}
        {label}
      </Text>
    </Pressable>
  );
}
function Heading({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ fontSize: 22, fontWeight: "600", color: t.textPrimary }}
    >
      {children}
    </Text>
  );
}
function ExpiryText({ lot, today }: { lot: InventoryLot; today: string }) {
  if (
    lot.storageLocation !== "freezer" &&
    lot.expiryKind === "use_by" &&
    lot.expiryDate &&
    lot.expiryDate < today
  ) {
    return <Notice error>Use-by date passed · {lot.expiryDate} · confirmed packaging date</Notice>;
  }
  return <Body>{inventoryExpiryLabel(lot, today)}</Body>;
}
const locations = ["fridge", "freezer", "cupboard", "other"] as const;
const locationLabel = (value: string) => value[0].toUpperCase() + value.slice(1);
const views = ["all", "use_soon", "fridge", "freezer", "cupboard"] as const;
type ViewName = (typeof views)[number];

export function Kitchen({
  client,
  household,
  userId,
  onBack,
  onSignOut,
}: {
  client: SupabaseClient<Database>;
  household: Household;
  userId: string;
  onBack(): void;
  onSignOut(): unknown | Promise<unknown>;
}) {
  const service = useMemo(() => createInventoryService(client), [client]);
  const store = useMemo(
    () => inventoryPendingStore(authStorage, userId, household.id),
    [userId, household.id],
  );
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [route, setRoute] = useState<"list" | "add" | string>("list");
  const [view, setView] = useState<ViewName>("all");
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true),
    submitting = useRef(false),
    loadId = useRef(0);
  const load = useCallback(async () => {
    const current = ++loadId.current;
    try {
      const saved = await store.read();
      const result = await service.listLots(household.id);
      if (!alive.current || current !== loadId.current) return;
      setPending(saved);
      setReady(true);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setLots(result.value);
      setError(null);
    } catch {
      if (alive.current && current === loadId.current)
        setError("Your saved stock change couldn’t be loaded. Retry before making another change.");
    }
  }, [service, store, household.id]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      loadId.current++;
    };
  }, [load]);

  async function submit(change: PendingChange, restored = false): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let persisted = restored;
    try {
      if (!restored) await store.write(change);
      persisted = true;
      if (!alive.current) return false;
      const result =
        change.kind === "add"
          ? await service.addLot(household.id, change.input as unknown as AddLotInput)
          : change.kind === "adjust"
            ? await service.adjustLot(household.id, change.input as unknown as AdjustLotInput)
            : await service.freezeLot(household.id, change.input as unknown as FreezeLotInput);
      if (!alive.current) return false;
      if (!result.ok) {
        if (isDefinitiveInventoryRejection(result.error.code)) {
          await store.clear();
          setPending(null);
          if (result.error.code === "conflict") {
            await load();
            setRoute("list");
          }
        } else setPending(change);
        setError(result.error.message);
        return false;
      }
      await store.clear();
      if (!alive.current) return false;
      setPending(null);
      setRoute("list");
      setView("all");
      await load();
      setMessage(
        change.kind === "add"
          ? "Ingredient added to your kitchen."
          : change.kind === "freeze"
            ? "Moved to the freezer. Original expiry information is retained."
            : "Amount corrected. Your stock history is retained.",
      );
      return true;
    } catch {
      if (alive.current) {
        if (persisted) setPending(change);
        setError(
          persisted
            ? "We couldn’t finish this change. Retry the saved change before adding another; it won’t be counted twice."
            : "We couldn’t securely save your request on this device. Nothing was submitted. Retry when device storage is available.",
        );
      }
      return false;
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const today = householdLocalDate(new Date(), household.timezone);
  if (!ready)
    return (
      <Screen title="Opening your kitchen…">
        <Body>Loading saved stock</Body>
        {error ? <Notice error>{error}</Notice> : null}
        <Button label="Retry kitchen" onPress={load} />
        <TextLink label="Back home" onPress={onBack} />
        <TextLink label="Sign out" onPress={onSignOut} />
      </Screen>
    );
  if (pending)
    return (
      <Screen
        title="Finish your saved change"
        subtitle="The last response may not have reached this device. Retrying uses the same request and won’t count the change twice."
      >
        <Card>
          <Heading>
            {pending.kind === "add"
              ? "Add ingredient"
              : pending.kind === "adjust"
                ? "Correct amount"
                : "Move to freezer"}
          </Heading>
          <Body>Your original request is saved on this device.</Body>
        </Card>
        {error ? <Notice error>{error}</Notice> : null}
        <Button
          label="Retry saved stock change"
          onPress={() => submit(pending, true)}
          loading={busy}
        />
        <TextLink label="Back home" disabled={busy} onPress={onBack} />
        <TextLink label="Sign out" disabled={busy} onPress={onSignOut} />
      </Screen>
    );
  if (route === "add")
    return (
      <AddIngredient
        service={service}
        busy={busy}
        error={error}
        onBack={() => {
          setRoute("list");
          setError(null);
        }}
        onSave={(input) =>
          submit({ kind: "add", input: { ...input, requestId: Crypto.randomUUID() } })
        }
      />
    );
  const selected = lots.find((lot) => lot.id === route);
  if (selected)
    return (
      <LotDetail
        key={`${selected.id}.${selected.version}`}
        lot={selected}
        today={today}
        service={service}
        busy={busy}
        error={error}
        onBack={() => {
          setRoute("list");
          setError(null);
        }}
        onAdjust={(input) =>
          submit({ kind: "adjust", input: { ...input, requestId: Crypto.randomUUID() } })
        }
        onFreeze={() =>
          submit({
            kind: "freeze",
            input: {
              lotId: selected.id,
              expectedVersion: selected.version,
              requestId: Crypto.randomUUID(),
            },
          })
        }
      />
    );
  const visible = filterInventoryLots(lots, view, today);
  return (
    <Screen
      step="kitchen.inventory"
      eyebrow={household.name}
      title="Your kitchen"
      subtitle="A little stock awareness. More possibilities for dinner."
    >
      <Button
        label="Add ingredient"
        onPress={() => {
          setRoute("add");
          setError(null);
          setMessage(null);
        }}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {views.map((v) => (
          <Choice
            key={v}
            label={v === "use_soon" ? "Use soon" : locationLabel(v)}
            selected={v === view}
            onPress={() => setView(v)}
          />
        ))}
      </View>
      {view === "use_soon" ? (
        <Body>
          Dates within the next 3 days, including passed dates. Estimates are labelled. Frozen lots
          are shown in Freezer.
        </Body>
      ) : null}
      {error ? <Notice error>{error} Previously loaded stock may be out of date.</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}
      {!visible.length ? (
        <Card>
          <Heading>
            {lots.some((lot) => lot.quantityBase > 0)
              ? "Nothing in this view"
              : "Start with what you’ve got."}
          </Heading>
          <Body>
            {lots.some((lot) => lot.quantityBase > 0)
              ? "Try another storage view or add an ingredient."
              : "Add a few ingredients you have to hand. You can build up your kitchen at your own pace."}
          </Body>
        </Card>
      ) : null}
      {visible.map((lot, index) => (
        <Card key={lot.id}>
          <Heading>{lot.ingredient.name}</Heading>
          <Body>
            {formatInventoryQuantity(lot.quantityBase, lot.measurementType, lot.confidence)} ·{" "}
            {locationLabel(lot.storageLocation)}
          </Body>
          <ExpiryText lot={lot} today={today} />
          <Button
            secondary
            label={`View ${lot.ingredient.name} lot ${index + 1}`}
            onPress={() => {
              setRoute(lot.id);
              setMessage(null);
            }}
          />
        </Card>
      ))}
      {lots.some((lot) => lot.quantityBase === 0) ? (
        <DepletedLots lots={lots.filter((lot) => lot.quantityBase === 0)} onSelect={setRoute} />
      ) : null}
      <Button secondary label="Refresh stock" onPress={load} />
      <TextLink label="Back home" onPress={onBack} />
    </Screen>
  );
}

function DepletedLots({ lots, onSelect }: { lots: InventoryLot[]; onSelect(id: string): void }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <TextLink
        label={show ? "Hide finished lots" : "Show finished lots and history"}
        onPress={() => setShow(!show)}
      />
      {show
        ? lots.map((lot, index) => (
            <Card key={lot.id}>
              <Heading>{lot.ingredient.name}</Heading>
              <Body>No stock remaining · {locationLabel(lot.storageLocation)}</Body>
              <TextLink
                label={`View finished ${lot.ingredient.name} lot ${index + 1}`}
                onPress={() => onSelect(lot.id)}
              />
            </Card>
          ))
        : null}
    </>
  );
}

type Service = ReturnType<typeof createInventoryService>;
function AddIngredient({
  service,
  busy,
  error,
  onBack,
  onSave,
}: {
  service: Service;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onSave(input: Omit<AddLotInput, "requestId">): Promise<boolean>;
}) {
  const [query, setQuery] = useState(""),
    [items, setItems] = useState<Ingredient[]>([]),
    [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [searching, setSearching] = useState(false),
    [localError, setLocalError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(""),
    [unit, setUnit] = useState<AddLotInput["unit"]>("g");
  const [storage, setStorage] = useState<AddLotInput["storageLocation"]>("fridge");
  const [approximate, setApproximate] = useState(false),
    [expiryKind, setExpiryKind] = useState<AddLotInput["expiryKind"]>(null),
    [date, setDate] = useState(""),
    [note, setNote] = useState("");
  const searchId = useRef(0);
  const search = useCallback(async () => {
    const current = ++searchId.current;
    setSearching(true);
    setLocalError(null);
    const result = await service.searchIngredients(query);
    if (current !== searchId.current) return;
    setSearching(false);
    if (!result.ok) setLocalError(result.error.message);
    else setItems(result.value);
  }, [query, service]);
  useEffect(() => {
    const timer = setTimeout(() => void search(), 250);
    return () => {
      clearTimeout(timer);
      searchId.current++;
    };
  }, [search]);
  const units =
    ingredient?.measurementType === "mass"
      ? (["g", "kg"] as const)
      : ingredient?.measurementType === "volume"
        ? (["ml", "l"] as const)
        : (["count"] as const);
  async function save() {
    const numeric = Number(quantity);
    if (!quantity.trim() || !Number.isFinite(numeric) || numeric <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return;
    }
    if (expiryKind && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setLocalError("Enter the date as YYYY-MM-DD, or choose Not recorded.");
      return;
    }
    if (!ingredient) return;
    setLocalError(null);
    await onSave({
      ingredientId: ingredient.id,
      quantity: numeric,
      unit,
      storageLocation: storage,
      confidence: approximate ? "estimated" : "confirmed",
      expiryDate: expiryKind ? date : null,
      expiryKind,
      note,
    });
  }
  return (
    <Screen
      step="kitchen.add"
      title={ingredient ? `Add ${ingredient.name}` : "What’s in your kitchen?"}
      subtitle={
        ingredient
          ? "Each addition keeps its own amount, storage and date."
          : "Search the ingredient catalogue. You can add more at any time."
      }
    >
      {!ingredient ? (
        <>
          <Field
            label="Search ingredients"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
          />
          <Button label="Search catalogue" secondary onPress={search} loading={searching} />
          {items.map((item) => (
            <Button
              key={item.id}
              secondary
              label={`Choose ${item.name}`}
              onPress={() => {
                setIngredient(item);
                setStorage(item.defaultStorageLocation);
                setUnit(
                  item.measurementType === "mass"
                    ? "g"
                    : item.measurementType === "volume"
                      ? "ml"
                      : "count",
                );
                setLocalError(null);
              }}
            />
          ))}
          {!searching && !items.length ? (
            <Body>
              No matching ingredients. Try a common name such as onion or rice. The starting
              catalogue is still growing.
            </Body>
          ) : null}
        </>
      ) : (
        <>
          <Card>
            <Field
              editable={!busy}
              label="Amount"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              {units.map((u) => (
                <Choice
                  key={u}
                  label={`Unit: ${u}`}
                  selected={unit === u}
                  onPress={() => setUnit(u)}
                  disabled={busy}
                />
              ))}
            </View>
            <Choice
              label="Exact amount"
              selected={!approximate}
              onPress={() => setApproximate(false)}
              disabled={busy}
            />
            <Choice
              label="Approximate amount"
              selected={approximate}
              onPress={() => setApproximate(true)}
              disabled={busy}
            />
          </Card>
          <Card>
            <Heading>Where is it stored?</Heading>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {locations.map((location) => (
                <Choice
                  key={location}
                  label={`Storage: ${locationLabel(location)}`}
                  selected={storage === location}
                  onPress={() => setStorage(location)}
                  disabled={busy}
                />
              ))}
            </View>
            {storage === "freezer" ? (
              <Body>
                Already in the freezer. Its freezing date is unknown. No freezer expiry is
                calculated; retain any original packaging date below.
              </Body>
            ) : null}
          </Card>
          <Card>
            <Heading>Date on the pack?</Heading>
            {(
              [
                { key: null, label: "Not recorded" },
                { key: "use_by", label: "Use-by from packaging" },
                { key: "best_before", label: "Best-before from packaging" },
                { key: "estimated", label: "Estimated freshness" },
              ] as const
            ).map(({ key, label }) => (
              <Choice
                key={label}
                label={label}
                selected={expiryKind === key}
                disabled={busy}
                onPress={() => setExpiryKind(key)}
              />
            ))}
            {expiryKind ? (
              <Field
                editable={!busy}
                label="Date (YYYY-MM-DD)"
                placeholder="2026-11-05"
                value={date}
                onChangeText={setDate}
                maxLength={10}
              />
            ) : null}
            <Body>
              {expiryKind === "estimated"
                ? "This is your estimate, not a confirmed food-safety date."
                : "Only choose a packaging date when you’ve checked the label. Leave it unrecorded if you don’t know."}
            </Body>
          </Card>
          <Field
            editable={!busy}
            label="Stock note (optional)"
            value={note}
            onChangeText={setNote}
            maxLength={300}
          />
          <Body>
            {quantity || "0"} {unit} · {locationLabel(storage)} ·{" "}
            {approximate ? "Approximate amount" : "Exact amount"}
            {expiryKind
              ? ` · ${expiryKind === "estimated" ? "Estimated" : expiryKind === "use_by" ? "Use by" : "Best before"} ${date}`
              : " · Expiry not recorded"}
          </Body>
          <Button label="Add to kitchen" onPress={save} loading={busy} />
          <TextLink
            label="Choose a different ingredient"
            disabled={busy}
            onPress={() => setIngredient(null)}
          />
        </>
      )}
      {localError || error ? <Notice error>{localError ?? error}</Notice> : null}
      <TextLink label="Back to kitchen" disabled={busy} onPress={onBack} />
    </Screen>
  );
}

function LotDetail({
  lot,
  today,
  service,
  busy,
  error,
  onBack,
  onAdjust,
  onFreeze,
}: {
  lot: InventoryLot;
  today: string;
  service: Service;
  busy: boolean;
  error: string | null;
  onBack(): void;
  onAdjust(input: Omit<AdjustLotInput, "requestId">): Promise<boolean>;
  onFreeze(): Promise<boolean>;
}) {
  const [mode, setMode] = useState<"view" | "adjust" | "freeze">("view");
  const [amount, setAmount] = useState(String(lot.quantityBase)),
    [reason, setReason] = useState(""),
    [approximate, setApproximate] = useState(lot.confidence === "estimated");
  const [history, setHistory] = useState<InventoryTransaction[] | null>(null),
    [historyError, setHistoryError] = useState<string | null>(null),
    [localError, setLocalError] = useState<string | null>(null);
  const baseUnit =
    lot.measurementType === "mass" ? "g" : lot.measurementType === "volume" ? "ml" : "count";
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function loadHistory() {
    setHistoryError(null);
    const result = await service.getHistory(lot.householdId, lot.id);
    if (!live.current) return;
    if (result.ok) setHistory(result.value);
    else setHistoryError(result.error.message);
  }
  async function saveCorrection() {
    const numeric = Number(amount);
    if (!amount.trim() || !Number.isFinite(numeric) || numeric < 0 || !reason.trim()) {
      setLocalError("Enter a remaining amount of zero or more and a short reason.");
      return;
    }
    setLocalError(null);
    await onAdjust({
      lotId: lot.id,
      expectedVersion: lot.version,
      quantityBase: numeric,
      confidence: approximate ? "estimated" : "confirmed",
      reason: reason.trim(),
    });
  }
  return (
    <Screen
      step="kitchen.lot"
      title={lot.ingredient.name}
      subtitle={`${locationLabel(lot.storageLocation)} · Added ${lot.createdAt.slice(0, 10)}`}
    >
      <Card>
        <Heading>
          {formatInventoryQuantity(lot.quantityBase, lot.measurementType, lot.confidence)} remaining
        </Heading>
        <Body>
          Originally{" "}
          {formatInventoryQuantity(
            lot.originalQuantityBase,
            lot.measurementType,
            lot.originalConfidence,
          )}
        </Body>
        <ExpiryText lot={lot} today={today} />
        {lot.frozenAt ? (
          <Body>
            Frozen {lot.frozenAt.slice(0, 10)}. Original{" "}
            {lot.expiryKind === "use_by"
              ? "use-by"
              : lot.expiryKind === "best_before"
                ? "best-before"
                : "estimated"}{" "}
            date: {lot.expiryDate ?? "not recorded"}. No freezer expiry calculated.
          </Body>
        ) : lot.storageLocation === "freezer" ? (
          <Body>
            Already in the freezer · freezing date not recorded. No freezer expiry calculated.
          </Body>
        ) : null}
        {lot.note ? <Body>{lot.note}</Body> : null}
      </Card>
      {mode === "view" ? (
        <>
          <Button label="Correct amount" secondary onPress={() => setMode("adjust")} />
          {lot.storageLocation !== "freezer" && lot.quantityBase > 0 ? (
            <Button label="Move to freezer" secondary onPress={() => setMode("freeze")} />
          ) : null}
        </>
      ) : mode === "adjust" ? (
        <Card>
          <Heading>What’s actually left?</Heading>
          <Field
            label={`New remaining amount (${baseUnit})`}
            editable={!busy}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <Choice
            label="Exact remaining amount"
            selected={!approximate}
            onPress={() => setApproximate(false)}
            disabled={busy}
          />
          <Choice
            label="Approximate remaining amount"
            selected={approximate}
            onPress={() => setApproximate(true)}
            disabled={busy}
          />
          <Field
            editable={!busy}
            label="Reason for correction"
            value={reason}
            onChangeText={setReason}
            maxLength={300}
          />
          <Body>
            {lot.quantityBase} {baseUnit} → {amount || "0"} {baseUnit}. This adds a correction to
            your history.
          </Body>
          <Button label="Save corrected amount" onPress={saveCorrection} loading={busy} />
          <TextLink label="Cancel correction" disabled={busy} onPress={() => setMode("view")} />
        </Card>
      ) : (
        <Card>
          <Heading>Record freezing this lot?</Heading>
          <Body>
            Only confirm once you’ve moved it to the freezer. The original expiry date stays in the
            history. Stockpot does not calculate a new freezer expiry.
          </Body>
          <Button label="Confirm move to freezer" onPress={onFreeze} loading={busy} />
          <TextLink label="Cancel freezer move" disabled={busy} onPress={() => setMode("view")} />
        </Card>
      )}
      {error || localError ? <Notice error>{localError ?? error}</Notice> : null}
      <TextLink
        label={history ? "Refresh stock history" : "Show stock history"}
        disabled={busy}
        onPress={loadHistory}
      />
      {historyError ? <Notice error>{historyError}</Notice> : null}
      {history ? (
        <Card>
          <Heading>Stock history</Heading>
          {history.map((entry) => (
            <View key={entry.id} style={{ gap: 4 }}>
              <Body>
                {entry.sourceType === "manual_add"
                  ? "Added"
                  : entry.sourceType === "freeze"
                    ? "Moved to freezer"
                    : "Amount corrected"}{" "}
                · {entry.quantityDeltaBase > 0 ? "+" : ""}
                {entry.quantityDeltaBase} {baseUnit}
              </Body>
              <Body>
                {entry.occurredAt.slice(0, 19).replace("T", " ")} UTC · {entry.reason}
              </Body>
            </View>
          ))}
        </Card>
      ) : null}
      <TextLink label="Back to kitchen" disabled={busy} onPress={onBack} />
    </Screen>
  );
}
