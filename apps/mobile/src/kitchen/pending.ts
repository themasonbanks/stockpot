import { isUuid } from "@stockpot/domain";
import type { KeyValueStorage } from "../auth/storage";

export function isDefinitiveInventoryRejection(code: string) {
  return code === "invalid_input" || code === "conflict";
}

export type PendingChange = {
  kind: "add" | "adjust" | "freeze";
  input: { requestId: string; [key: string]: unknown };
};
export function inventoryPendingStore(
  storage: KeyValueStorage,
  userId: string,
  householdId: string,
) {
  const key = `stockpot.inventory-pending.${userId}.${householdId}`;
  return {
    async read(): Promise<PendingChange | null> {
      const raw = await storage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (
        !value ||
        !["add", "adjust", "freeze"].includes(value.kind) ||
        !value.input ||
        !isUuid(value.input.requestId)
      )
        throw new Error("The saved stock change couldn’t be read safely.");
      return value;
    },
    async write(value: PendingChange) {
      await storage.setItem(key, JSON.stringify(value));
    },
    async clear() {
      await storage.removeItem(key);
    },
  };
}
