import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getResend } from "@/lib/resend";
import { getEmailTemplate, TOTAL_EMAILS } from "@/lib/drip-templates";

const FROM = "Asad from Huddle Duck <asad@huddleduck.co.uk>";
const UNSUB_MAILTO =
  "mailto:asad@huddleduck.co.uk?subject=Unsubscribe&body=Please%20remove%20me%20from%20future%20emails";

// Minimum hours between sends per email tier
// Emails 1-4: daily (20h minimum to allow cron timing drift)
// Emails 5-10: every other day (44h minimum)
const MIN_HOURS_DAILY = 20;
const MIN_HOURS_ALTERNATE = 44;

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resend = getResend();
  const results: Array<{
    cohort: string;
    emailNum: number;
    sent: number;
    failed: number;
    skipped: string | null;
  }> = [];

  // Get all cohorts from state
  const stateRows = await db.execute("SELECT cohort, last_email_sent, last_sent_at FROM drip_state ORDER BY cohort");

  for (const row of stateRows.rows) {
    const cohort = row.cohort as string;
    const lastEmailSent = row.last_email_sent as number;
    const lastSentAt = row.last_sent_at as string;

    // Sequence complete
    if (lastEmailSent >= TOTAL_EMAILS) {
      results.push({ cohort, emailNum: 0, sent: 0, failed: 0, skipped: "sequence complete" });
      continue;
    }

    const nextEmail = lastEmailSent + 1;

    // Check minimum gap between sends
    if (lastSentAt) {
      const hoursSinceLast = (Date.now() - new Date(lastSentAt).getTime()) / (1000 * 60 * 60);
      const minHours = nextEmail <= 4 ? MIN_HOURS_DAILY : MIN_HOURS_ALTERNATE;

      if (hoursSinceLast < minHours) {
        results.push({
          cohort,
          emailNum: nextEmail,
          sent: 0,
          failed: 0,
          skipped: `too soon (${Math.round(hoursSinceLast)}h since last, need ${minHours}h)`,
        });
        continue;
      }
    }

    // Get contacts for this cohort, excluding unsubscribes
    const contactRows = await db.execute({
      sql: `SELECT c.email FROM drip_contacts c
            LEFT JOIN drip_unsubscribes u ON c.email = u.email
            WHERE c.cohort = ? AND u.email IS NULL
            ORDER BY c.email`,
      args: [cohort],
    });

    const contacts = contactRows.rows.map((r) => r.email as string);
    if (contacts.length === 0) {
      results.push({ cohort, emailNum: nextEmail, sent: 0, failed: 0, skipped: "no contacts" });
      continue;
    }

    const template = getEmailTemplate(nextEmail);
    console.log(`[drip] Cohort ${cohort}: Sending Email ${nextEmail} "${template.subject}" to ${contacts.length} contacts`);

    let sent = 0;
    let failed = 0;

    for (const email of contacts) {
      try {
        const { error } = await resend.emails.send({
          from: FROM,
          to: email,
          subject: template.subject,
          html: template.html,
          headers: {
            "List-Unsubscribe": `<${UNSUB_MAILTO}>`,
          },
        });

        if (error) {
          console.log(`[drip]   FAIL ${email}: ${error.message}`);
          await db.execute({
            sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status, error) VALUES (?, ?, ?, 'failed', ?)",
            args: [cohort, nextEmail, email, error.message],
          });
          failed++;
        } else {
          await db.execute({
            sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status) VALUES (?, ?, ?, 'sent')",
            args: [cohort, nextEmail, email],
          });
          sent++;
        }

        // 600ms delay between sends to avoid rate limits
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[drip]   ERROR ${email}: ${msg}`);
        await db.execute({
          sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status, error) VALUES (?, ?, ?, 'error', ?)",
          args: [cohort, nextEmail, email, msg],
        });
        failed++;
      }
    }

    // Update state
    await db.execute({
      sql: "UPDATE drip_state SET last_email_sent = ?, last_sent_at = ? WHERE cohort = ?",
      args: [nextEmail, new Date().toISOString(), cohort],
    });

    console.log(`[drip] Cohort ${cohort}: Done. ${sent} sent, ${failed} failed`);
    results.push({ cohort, emailNum: nextEmail, sent, failed, skipped: null });
  }

  return NextResponse.json({ ok: true, results });
}
