type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A durable, user-scoped id makes network retries and app restarts the same operation.
export async function householdRequestId(storage: Storage, userId: string, generate: () => string) {
  const key = `stockpot.household-request.${userId}`;
  const existing = await storage.getItem(key);
  if (existing && uuid.test(existing)) return existing;
  const id = generate();
  if (!uuid.test(id)) throw new Error("Could not prepare household creation. Please retry.");
  await storage.setItem(key, id);
  return id;
}
export function detectedTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}
