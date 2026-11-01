import type { DependencyConfig } from "./config";

type FetchDependency = (url: string, init: RequestInit) => Promise<Response>;

export function createReadinessCheck(
  config: DependencyConfig | null,
  fetchDependency: FetchDependency = fetch,
  timeoutMs = 2000,
): () => Promise<boolean> {
  return async () => {
    if (!config) return false;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const expired = new Promise<false>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(false);
        }, timeoutMs);
      });
      const available = Promise.all(
        ["/auth/v1/health", "/rest/v1/"].map(async (path) => {
          const response = await fetchDependency(`${config.url}${path}`, {
            method: "GET",
            headers: { apikey: config.anonymousKey },
            signal: controller.signal,
            redirect: "error",
          });
          // Readiness consumes status only and does not retain upstream response data.
          void response.body?.cancel().catch(() => {});
          return response.ok;
        }),
      ).then((results) => results.every(Boolean));
      return await Promise.race([available, expired]);
    } catch {
      return false;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      controller.abort();
    }
  };
}
