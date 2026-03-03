/**
 * Add contacts to a Resend segment from Turso state.
 * Usage: npx tsx scripts/add-to-segment.ts <segment-id> <last-email-sent>
 *   e.g. npx tsx scripts/add-to-segment.ts 3cadc519-... 0
 */

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const segmentId = process.argv[2];
const lastEmailSent = parseInt(process.argv[3], 10);

if (!segmentId || isNaN(lastEmailSent)) {
  console.error("Usage: npx tsx scripts/add-to-segment.ts <segment-id> <last-email-sent>");
  process.exit(1);
}

const db = createClient({ url: env.TURSO_DATABASE_URL!, authToken: env.TURSO_AUTH_TOKEN! });
const RESEND_KEY = env.RESEND_API_KEY!;

async function main() {
  const rows = await db.execute({
    sql: `SELECT cs.email FROM drip_contact_state cs
          LEFT JOIN drip_unsubscribes u ON cs.email = u.email
          WHERE cs.last_email_sent = ? AND u.email IS NULL
          ORDER BY cs.email`,
    args: [lastEmailSent],
  });

  const emails = rows.rows.map((r) => r.email as string);
  console.log(`Adding ${emails.length} contacts (at email ${lastEmailSent}) to segment ${segmentId}...\n`);

  let added = 0;
  let failed = 0;

  for (const email of emails) {
    const res = await fetch(
      `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await res.json();

    if (data.id || data.audienceId) {
      added++;
    } else if (data.statusCode === 429) {
      // Rate limited — wait and retry
      await new Promise((r) => setTimeout(r, 1500));
      const retry = await fetch(
        `https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      const retryData = await retry.json();
      if (retryData.id || retryData.audienceId) {
        added++;
      } else {
        console.log(`  FAIL ${email}: ${JSON.stringify(retryData)}`);
        failed++;
      }
    } else {
      console.log(`  FAIL ${email}: ${JSON.stringify(data)}`);
      failed++;
    }

    // Respect 2 req/sec rate limit
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nDone. Added: ${added}, Failed: ${failed}`);
}

main().catch(console.error);
