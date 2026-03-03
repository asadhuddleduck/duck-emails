import { createClient, type Client } from "@libsql/client";

let client: Client | null = null;

function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) throw new Error("TURSO_DATABASE_URL is not set");
    if (!authToken) throw new Error("TURSO_AUTH_TOKEN is not set");
    client = createClient({ url, authToken });
  }
  return client;
}

export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const c = getDb();
    const value = (c as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === "function") return value.bind(c);
    return value;
  },
});
