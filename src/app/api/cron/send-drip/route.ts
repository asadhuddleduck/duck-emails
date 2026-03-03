import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEmailTemplate, TOTAL_EMAILS } from "@/lib/drip-templates";

// Vercel Pro: allow up to 300s
export const maxDuration = 300;

const FROM = "Asad from Huddle Duck <asad@huddleduck.co.uk>";
const RESEND_API = "https://api.resend.com";

// The "General" audience in Resend (used as a staging area for broadcasts)
const AUDIENCE_ID = "3cadc519-dfdc-4eff-b619-75971113b02f";

// Cadence: emails 1-4 daily, emails 5-10 every other day
const MIN_HOURS_DAILY = 20;
const MIN_HOURS_ALTERNATE = 44;

// ── Resend helpers ─────────────────────────────────────────────────────────

function resendHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function resendFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Respect 2 req/sec rate limit
  await new Promise((r) => setTimeout(r, 600));
  const res = await fetch(url, { ...options, headers: { ...resendHeaders(), ...(options.headers || {}) } });

  // Auto-retry on 429
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 2000));
    return fetch(url, { ...options, headers: { ...resendHeaders(), ...(options.headers || {}) } });
  }

  return res;
}

/** Sync the General audience to match a target list of emails (diff-based). */
async function syncAudience(targetEmails: string[]): Promise<{ added: number; removed: number; failed: number }> {
  // Get current audience contacts
  const listRes = await fetch(`${RESEND_API}/audiences/${AUDIENCE_ID}/contacts?limit=500`, {
    headers: resendHeaders(),
  });
  const listData = await listRes.json();
  const current = (listData.data || []) as Array<{ id: string; email: string }>;

  const currentMap = new Map(current.map((c) => [c.email.toLowerCase(), c.id]));
  const targetSet = new Set(targetEmails.map((e) => e.toLowerCase()));

  // Contacts to remove (in audience but not in target)
  const toRemove = current.filter((c) => !targetSet.has(c.email.toLowerCase()));
  // Contacts to add (in target but not in audience)
  const toAdd = targetEmails.filter((e) => !currentMap.has(e.toLowerCase()));

  let added = 0;
  let removed = 0;
  let failed = 0;

  for (const contact of toRemove) {
    const res = await resendFetch(`${RESEND_API}/audiences/${AUDIENCE_ID}/contacts/${contact.id}`, {
      method: "DELETE",
    });
    if (res.ok) removed++;
    else failed++;
  }

  for (const email of toAdd) {
    const res = await resendFetch(
      `${RESEND_API}/contacts/${encodeURIComponent(email)}/segments/${AUDIENCE_ID}`,
      { method: "POST" }
    );
    const data = await res.json();
    if (data.id || data.audienceId) added++;
    else {
      console.log(`[drip] Failed to add ${email}: ${JSON.stringify(data)}`);
      failed++;
    }
  }

  return { added, removed, failed };
}

/** Replace mailto unsubscribe link with Resend's one-click broadcast URL. */
function patchUnsubscribeForBroadcast(html: string): string {
  const mailto =
    "mailto:asad@huddleduck.co.uk?subject=Unsubscribe&body=Please%20remove%20me%20from%20future%20emails";
  return html.replaceAll(mailto, "{{{RESEND_UNSUBSCRIBE_URL}}}");
}

// ── Cron handler ───────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  // Get all active contacts (exclude unsubscribes and completed)
  const stateRows = await db.execute(`
    SELECT cs.email, cs.last_email_sent, cs.last_sent_at
    FROM drip_contact_state cs
    LEFT JOIN drip_unsubscribes u ON cs.email = u.email
    WHERE u.email IS NULL AND cs.last_email_sent < ${TOTAL_EMAILS}
    ORDER BY cs.last_email_sent ASC, cs.email ASC
  `);

  if (stateRows.rows.length === 0) {
    return NextResponse.json({ ok: true, message: "No active contacts. Sequence complete for all." });
  }

  // Group contacts by last_email_sent
  const groups = new Map<number, { emails: string[]; maxSentAt: string }>();
  for (const row of stateRows.rows) {
    const lastEmailSent = row.last_email_sent as number;
    const lastSentAt = (row.last_sent_at as string) || "";
    const email = row.email as string;

    const group = groups.get(lastEmailSent) || { emails: [], maxSentAt: "" };
    group.emails.push(email);
    if (lastSentAt > group.maxSentAt) group.maxSentAt = lastSentAt;
    groups.set(lastEmailSent, group);
  }

  const sortedGroups = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  const groupSummary = sortedGroups.map(([num, g]) => ({
    atEmail: num,
    contacts: g.emails.length,
  }));

  // Process only the LOWEST email number group each run.
  // This lets everyone catch up before advancing further.
  const [lastEmailSent, group] = sortedGroups[0];
  const nextEmail = lastEmailSent + 1;

  // Check cadence
  if (group.maxSentAt) {
    const hoursSince = (Date.now() - new Date(group.maxSentAt).getTime()) / (1000 * 60 * 60);
    const minHours = nextEmail <= 4 ? MIN_HOURS_DAILY : MIN_HOURS_ALTERNATE;

    if (hoursSince < minHours) {
      return NextResponse.json({
        ok: true,
        skipped: `Too soon for Email ${nextEmail} (${Math.round(hoursSince)}h elapsed, need ${minHours}h)`,
        groups: groupSummary,
      });
    }
  }

  const template = getEmailTemplate(nextEmail);
  const broadcastHtml = patchUnsubscribeForBroadcast(template.html);

  console.log(
    `[drip] Sending Email ${nextEmail} "${template.subject}" to ${group.emails.length} contacts via broadcast`
  );

  // Step 1: Sync the General audience to match this group
  console.log(`[drip] Syncing audience (${group.emails.length} target contacts)...`);
  const sync = await syncAudience(group.emails);
  console.log(`[drip] Audience synced: +${sync.added} -${sync.removed} (${sync.failed} failed)`);

  if (sync.failed > group.emails.length * 0.5) {
    return NextResponse.json({
      ok: false,
      error: `Too many audience sync failures (${sync.failed}/${group.emails.length})`,
      sync,
    });
  }

  // Step 2: Create and send broadcast
  console.log("[drip] Creating broadcast...");
  const broadcastRes = await fetch(`${RESEND_API}/broadcasts`, {
    method: "POST",
    headers: resendHeaders(),
    body: JSON.stringify({
      segment_id: AUDIENCE_ID,
      from: FROM,
      subject: template.subject,
      html: broadcastHtml,
      send: true,
    }),
  });
  const broadcastData = await broadcastRes.json();

  if (!broadcastData.id) {
    console.log(`[drip] Broadcast FAILED: ${JSON.stringify(broadcastData)}`);
    return NextResponse.json({ ok: false, error: "Broadcast creation failed", details: broadcastData });
  }

  console.log(`[drip] Broadcast sent: ${broadcastData.id}`);

  // Step 3: Update per-contact state and log sends
  const now = new Date().toISOString();
  for (const email of group.emails) {
    await db.execute({
      sql: "UPDATE drip_contact_state SET last_email_sent = ?, last_sent_at = ? WHERE email = ?",
      args: [nextEmail, now, email],
    });
    await db.execute({
      sql: "INSERT INTO drip_sends (cohort, email_num, recipient, status) VALUES ('broadcast', ?, ?, 'sent')",
      args: [nextEmail, email],
    });
  }

  console.log(`[drip] State updated for ${group.emails.length} contacts`);

  return NextResponse.json({
    ok: true,
    emailNum: nextEmail,
    subject: template.subject,
    broadcastId: broadcastData.id,
    audienceSync: sync,
    contactsProcessed: group.emails.length,
    groups: groupSummary,
  });
}
