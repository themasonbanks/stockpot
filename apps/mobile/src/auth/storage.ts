export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
type Manifest = { version: 1; generation: string; count: number };
const MAX_CHUNKS = 128,
  CHUNK_CHARACTERS = 400;
function prefix(key: string) {
  return `stockpot.${Array.from(key, (c) => c.codePointAt(0)?.toString(16)).join("_")}`;
}
function parseManifest(value: string | null): Manifest | null {
  if (value === null) return null;
  const parsed = JSON.parse(value) as Partial<Manifest>;
  if (
    parsed.version !== 1 ||
    typeof parsed.generation !== "string" ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(parsed.generation) ||
    !Number.isInteger(parsed.count) ||
    (parsed.count ?? 0) < 1 ||
    (parsed.count ?? MAX_CHUNKS + 1) > MAX_CHUNKS
  )
    throw new Error("Invalid secure storage manifest");
  return parsed as Manifest;
}
/** Publish manifest last; interrupted writes retain the prior complete session. */
export function createChunkedStorage(
  store: KeyValueStorage,
  newGeneration: () => string,
): KeyValueStorage {
  let tail: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  }
  async function clean(base: string, item: Manifest | null) {
    if (item)
      await Promise.allSettled(
        Array.from({ length: item.count }, (_, i) =>
          store.removeItem(`${base}.${item.generation}.${i}`),
        ),
      );
  }
  return {
    getItem(key) {
      return serial(async () => {
        const base = prefix(key);
        try {
          const item = parseManifest(await store.getItem(`${base}.manifest`));
          if (!item) return null;
          const parts: string[] = [];
          for (let i = 0; i < item.count; i++) {
            const part = await store.getItem(`${base}.${item.generation}.${i}`);
            if (part === null) throw new Error("Incomplete secure session");
            parts.push(part);
          }
          return parts.join("");
        } catch {
          await store.removeItem(`${base}.manifest`);
          throw new Error("Stored sign-in could not be read. Please sign in again.");
        }
      });
    },
    setItem(key, value) {
      return serial(async () => {
        const base = prefix(key),
          old = parseManifest(await store.getItem(`${base}.manifest`)),
          points = Array.from(value);
        const count = Math.max(1, Math.ceil(points.length / CHUNK_CHARACTERS));
        if (count > MAX_CHUNKS) throw new Error("Session exceeds secure storage limit");
        const generation = newGeneration();
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(generation)) throw new Error("Invalid storage generation");
        const next: Manifest = { version: 1, generation, count };
        try {
          for (let i = 0; i < count; i++)
            await store.setItem(
              `${base}.${generation}.${i}`,
              points.slice(i * CHUNK_CHARACTERS, (i + 1) * CHUNK_CHARACTERS).join(""),
            );
          await store.setItem(`${base}.manifest`, JSON.stringify(next));
        } catch (error) {
          await clean(base, next);
          throw error;
        }
        await clean(base, old);
      });
    },
    removeItem(key) {
      return serial(async () => {
        const base = prefix(key);
        let old: Manifest | null = null;
        try {
          old = parseManifest(await store.getItem(`${base}.manifest`));
        } catch {
          /* Unpublish invalid manifests too. */
        }
        await store.removeItem(`${base}.manifest`);
        await clean(base, old);
      });
    },
  };
}
