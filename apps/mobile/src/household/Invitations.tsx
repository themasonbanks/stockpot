import {
  createInvitationService,
  type Database,
  type HouseholdInvitation,
  type InvitationMetadata,
  type SupabaseClient,
} from "@stockpot/database";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Share, Text } from "react-native";
import { Body, Button, Card, Field, Notice, TextLink, useTheme } from "../ui";
import { usePendingInvite } from "./PendingInvite";
export function JoinKitchen({
  client,
  onJoined,
  onCancel,
}: {
  client: SupabaseClient<Database>;
  onJoined(): Promise<void>;
  onCancel(): void;
}) {
  const pending = usePendingInvite();
  const [code, setCode] = useState(pending.code ?? ""),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const submitted = useRef(false),
    active = useRef(true);
  const service = useMemo(() => createInvitationService(client), [client]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (pending.code) setCode(pending.code);
  }, [pending.code]);
  async function join() {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!(await pending.save(code))) return;
      const result = await service.accept(code);
      if (!active.current) return;
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      await pending.clear();
      if (active.current) await onJoined();
    } catch {
      if (active.current)
        setError("We couldn’t finish joining. Please retry; you won’t be added twice.");
    } finally {
      submitted.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Card>
      <Body>
        Join the kitchen you’ve been invited to. Stock and dinner plans are shared; your profile
        stays yours.
      </Body>
      <Field
        label="Invitation code"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
      />
      {error || pending.error ? <Notice error>{error ?? pending.error}</Notice> : null}
      <Button label="Join kitchen" loading={busy} onPress={join} />
      <TextLink
        label="Cancel invitation"
        onPress={async () => {
          try {
            await pending.clear();
            onCancel();
          } catch {
            setError("The saved invitation couldn’t be cleared. Please retry.");
          }
        }}
      />
    </Card>
  );
}
export function ManageInvitations({
  client,
  householdId,
  full,
}: {
  client: SupabaseClient<Database>;
  householdId: string;
  full: boolean;
}) {
  const service = useMemo(() => createInvitationService(client), [client]);
  const [issued, setIssued] = useState<HouseholdInvitation | null>(null),
    [items, setItems] = useState<InvitationMetadata[]>([]),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const pending = useRef(false),
    active = useRef(true);
  const t = useTheme();
  const refresh = useCallback(async () => {
    const result = await service.list(householdId);
    if (!active.current) return;
    if (result.ok) setItems(result.value);
    else setError(result.error.message);
  }, [service, householdId]);
  useEffect(() => {
    active.current = true;
    void refresh();
    return () => {
      active.current = false;
    };
  }, [refresh]);
  async function issue() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setIssued(null);
    try {
      const result = await service.create(householdId);
      if (!active.current) return;
      if (result.ok) {
        setIssued(result.value);
        await refresh();
      } else setError(result.error.message);
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Card>
      <Text
        accessibilityRole="header"
        style={{ color: t.textPrimary, fontSize: 22, fontWeight: "600" }}
      >
        Share your kitchen
      </Text>
      <Body>
        {full
          ? "Your kitchen already has two members."
          : "Invite one other person. Codes expire in 24 hours; creating a new invitation replaces older unused codes."}
      </Body>
      {error ? <Notice error>{error}</Notice> : null}
      {issued ? (
        <>
          <Text
            selectable
            accessibilityLabel="Shareable invitation code"
            style={{ color: t.textPrimary, fontSize: 19, fontWeight: "600", letterSpacing: 1 }}
          >
            {issued.code.match(/.{1,4}/g)?.join("-")}
          </Text>
          <Body>Expires {new Date(issued.expiresAt).toLocaleString()}</Body>
          <Button
            label="Share invitation"
            secondary
            onPress={async () => {
              try {
                await Share.share({
                  message: `Join my Stockpot kitchen: stockpot://invite?code=${issued.code}\nOr enter code ${issued.code}`,
                });
              } catch {
                setError("Sharing didn’t open. You can copy the code above.");
              }
            }}
          />
        </>
      ) : null}
      {!full ? <Button label="Create new invitation" loading={busy} onPress={issue} /> : null}
      {items
        .filter(
          (item) => !item.acceptedAt && !item.revokedAt && Date.parse(item.expiresAt) > Date.now(),
        )
        .map((item) => (
          <Button
            key={item.id}
            label="Revoke active invitation"
            secondary
            disabled={busy}
            onPress={async () => {
              if (pending.current) return;
              pending.current = true;
              setBusy(true);
              try {
                const result = await service.revoke(item.id);
                if (!active.current) return;
                if (result.ok) {
                  setIssued(null);
                  await refresh();
                } else setError(result.error.message);
              } finally {
                pending.current = false;
                if (active.current) setBusy(false);
              }
            }}
          />
        ))}
    </Card>
  );
}
