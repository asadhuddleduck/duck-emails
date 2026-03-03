/**
 * Local drip email sender
 *
 * Reads per-contact state from Turso, determines who needs the next email,
 * enforces 1-email-per-day-per-contact, sends via Resend transactional API,
 * and updates per-contact state.
 *
 * Usage: npx tsx scripts/send-drip.ts
 *   --dry-run    Show what would be sent without sending
 *   --limit N    Max emails to send this run (default: 100)
 */

import { createClient } from "@libsql/client";
import { Resend } from "resend";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load env vars from .env.local ──────────────────────────────────────────

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

const TURSO_URL = env.TURSO_DATABASE_URL;
const TURSO_TOKEN = env.TURSO_AUTH_TOKEN;
const RESEND_KEY = env.RESEND_API_KEY;

if (!TURSO_URL || !TURSO_TOKEN || !RESEND_KEY) {
  console.error("Missing env vars. Check .env.local has TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, RESEND_API_KEY");
  process.exit(1);
}

// ── Import templates (dynamic import since they use export) ────────────────

// We can't import from src/lib directly with tsx easily, so inline the
// template loader. Instead, let's use a dynamic require via tsx resolution.

// Actually tsx handles TypeScript imports fine. Let's use path aliases.
import { getEmailTemplate, TOTAL_EMAILS } from "../src/lib/drip-templates";

// ── Config ─────────────────────────────────────────────────────────────────

const FROM = "Asad from Huddle Duck <asad@huddleduck.co.uk>";
const UNSUB_MAILTO =
  "mailto:asad@huddleduck.co.uk?subject=Unsubscribe&body=Please%20remove%20me%20from%20future%20emails";

// Minimum hours between sends per email tier
// Emails 1-4: daily (20h minimum for cron drift)
// Emails 5-10: every other day (44h minimum)
const MIN_HOURS_DAILY = 20;
const MIN_HOURS_ALTERNATE = 44;

const BATCH_SIZE = 100; // Resend batch API limit

// ── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const sendLimit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 100;

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  const resend = new Resend(RESEND_KEY);

  console.log(`\n📧 Drip Email Sender`);
  console.log(`   Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`   Send limit: ${sendLimit}`);
  console.log(`   Total emails in sequence: ${TOTAL_EMAILS}\n`);

  // Get all contacts with their state, excluding unsubscribes
  const rows = await db.execute(`
    SELECT cs.email, cs.last_email_sent, cs.last_sent_at
    FROM drip_contact_state cs
    LEFT JOIN drip_unsubscribes u ON cs.email = u.email
    WHERE u.email IS NULL
    ORDER BY cs.last_email_sent ASC, cs.email ASC
  `);

  const now = Date.now();
  const eligible: Array<{ email: string; nextEmail: number }> = [];
  let skippedComplete = 0;
  let skippedTooSoon = 0;
  let skippedUnsub = 0;

  for (const row of rows.rows) {
    const email = row.email as string;
    const lastEmailSent = row.last_email_sent as number;
    const lastSentAt = row.last_sent_at as string;

    // Sequence complete
    if (lastEmailSent >= TOTAL_EMAILS) {
      skippedComplete++;
      continue;
    }

    const nextEmail = lastEmailSent + 1;

    // Check minimum gap
    if (lastSentAt && lastSentAt !== "") {
      const hoursSince = (now - new Date(lastSentAt).getTime()) / (1000 * 60 * 60);
      const minHours = nextEmail <= 4 ? MIN_HOURS_DAILY : MIN_HOURS_ALTERNATE;

      if (hoursSince < minHours) {
        skippedTooSoon++;
        continue;
      }
    }

    eligible.push({ email, nextEmail });
  }

  console.log(`📊 Contact breakdown:`);
  console.log(`   Total contacts: ${rows.rows.length}`);
  console.log(`   Eligible to send: ${eligible.length}`);
  console.log(`   Skipped (sequence complete): ${skippedComplete}`);
  console.log(`   Skipped (too soon): ${skippedTooSoon}`);
  console.log();

  if (eligible.length === 0) {
    console.log("✅ Nothing to send. All contacts are either complete or too soon.");
    return;
  }

  // Cap at send limit
  const toSend = eligible.slice(0, sendLimit);
  if (eligible.length > sendLimit) {
    console.log(`⚠️  Capping at ${sendLimit} emails (${eligible.length - sendLimit} deferred to next run)\n`);
  }

  // Group by email number for efficient batch sending
  const byEmailNum = new Map<number, string[]>();
  for (const { email, nextEmail } of toSend) {
    const list = byEmailNum.get(nextEmail) || [];
    list.push(email);
    byEmailNum.set(nextEmail, list);
  }

  if (dryRun) {
    console.log("🔍 DRY RUN — would send:\n");
    for (const [emailNum, emails] of [...byEmailNum.entries()].sort((a, b) => a[0] - b[0])) {
      const template = getEmailTemplate(emailNum);
      console.log(`   Email ${emailNum}: "${template.subject}" → ${emails.length} contacts`);
      for (const e of emails.slice(0, 5)) {
        console.log(`      ${e}`);
      }
      if (emails.length > 5) {
        console.log(`      ... and ${emails.length - 5} more`);
      }
    }
    console.log(`\n   Total: ${toSend.length} emails`);
    console.log(`\nRe-run without --dry-run to send.`);
    return;
  }

  // Send emails
  let totalSent = 0;
  let totalFailed = 0;

  for (const [emailNum, emails] of [...byEmailNum.entries()].sort((a, b) => a[0] - b[0])) {
    const template = getEmailTemplate(emailNum);
    console.log(`📤 Sending Email ${emailNum}: "${template.subject}" to ${emails.length} contacts`);

    // Send in batches
    for (let i = 0; i < emails.length; i += BATCH_SIZE) {
      const batch = emails.slice(i, i + BATCH_SIZE);
      const payloads = batch.map((email) => ({
        from: FROM,
        to: email,
        subject: template.subject,
        html: template.html,
        headers: { "List-Unsubscribe": `<${UNSUB_MAILTO}>` },
      }));

      try {
        const { data, error } = await resend.batch.send(payloads);

        if (error) {
          console.log(`   ❌ Batch failed (${batch.length} emails): ${error.message}`);
          // Log failures
          for (const email of batch) {
            await db.execute({
              sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status, error) VALUES ('all', ?, ?, 'failed', ?)",
              args: [emailNum, email, error.message],
            });
          }
          totalFailed += batch.length;
        } else {
          const batchData = data?.data ?? [];
          // Log successes and update per-contact state
          for (let j = 0; j < batch.length; j++) {
            const emailAddr = batch[j];
            const emailId = batchData[j]?.id ?? "unknown";

            await db.execute({
              sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status) VALUES ('all', ?, ?, 'sent')",
              args: [emailNum, emailAddr],
            });

            await db.execute({
              sql: "UPDATE drip_contact_state SET last_email_sent = ?, last_sent_at = ? WHERE email = ?",
              args: [emailNum, new Date().toISOString(), emailAddr],
            });

            totalSent++;
          }
          console.log(`   ✅ Batch sent: ${batch.length} emails`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`   ❌ Batch error: ${msg}`);
        for (const email of batch) {
          await db.execute({
            sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status, error) VALUES ('all', ?, ?, 'error', ?)",
            args: [emailNum, email, msg],
          });
        }
        totalFailed += batch.length;
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Done. Sent: ${totalSent}, Failed: ${totalFailed}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
