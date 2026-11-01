import { createApp } from "./app";
import { readDependencyConfig, readListenConfig } from "./config";
import { createReadinessCheck } from "./readiness";

const { port, hostname } = readListenConfig(Bun.env);
const app = createApp({ readiness: createReadinessCheck(readDependencyConfig(Bun.env)) });

export default {
  fetch: app.fetch,
  port,
  hostname,
};

console.log(`Stockpot API listening on port ${port}`);
