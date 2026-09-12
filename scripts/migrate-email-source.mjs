import { createClient } from "@libsql/client";
import { EMAIL_SOURCE_SCHEMA } from "../src/lib/hatchflow-email.ts";

// Dry by default. No environment file is automatically loaded.
if (!process.argv.includes("--apply")) {
  console.log(EMAIL_SOURCE_SCHEMA.map(sql => `${sql};`).join("\n\n"));
  console.log("\nDry run only. Apply to this project's own database before enabling its HatchFlow adapter.");
} else {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) throw new Error("Explicit TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
  const database = createClient({ url, authToken });
  try {
    await database.batch([...EMAIL_SOURCE_SCHEMA], "write");
    console.log("Email source tables are ready. No existing contact was granted marketing permission.");
  } finally { database.close(); }
}
