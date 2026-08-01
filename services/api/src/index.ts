import { app } from "./app";

const port = Number(Bun.env.API_PORT ?? 3000);

export default {
  fetch: app.fetch,
  port,
};

console.log(`Stockpot API listening on http://localhost:${port}`);
