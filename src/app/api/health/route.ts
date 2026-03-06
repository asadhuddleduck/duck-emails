import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TOTAL_EMAILS } from "@/lib/drip-templates";

export async function GET() {
  try {
    const [groupsResult, stuckResult, lastBroadcastResult, unsubResult, activeResult] =
      await Promise.all([
        // 1. Distribution of contacts by last_email_sent
        db.execute(
          "SELECT last_email_sent, COUNT(*) AS count FROM drip_contact_state GROUP BY last_email_sent ORDER BY last_email_sent"
        ),

        // 2. Contacts stuck for more than 48h that haven't completed the sequence
        db.execute({
          sql: `SELECT COUNT(*) AS count FROM drip_contact_state
                WHERE last_sent_at != ''
                  AND last_sent_at < datetime('now', '-48 hours')
                  AND last_email_sent < ?`,
          args: [TOTAL_EMAILS],
        }),

        // 3. Most recent broadcast send
        db.execute(
          "SELECT sent_at FROM drip_sends WHERE cohort = 'broadcast' AND status = 'sent' ORDER BY sent_at DESC LIMIT 1"
        ),

        // 4. Total unsubscribes
        db.execute("SELECT COUNT(*) AS count FROM drip_unsubscribes"),

        // 5. Total active contacts (not unsubscribed, not completed)
        db.execute({
          sql: `SELECT COUNT(*) AS count FROM drip_contact_state
                WHERE last_email_sent < ?
                  AND email NOT IN (SELECT email FROM drip_unsubscribes)`,
          args: [TOTAL_EMAILS],
        }),
      ]);

    const groups: Record<number, number> = {};
    for (const row of groupsResult.rows) {
      groups[row.last_email_sent as number] = row.count as number;
    }

    const stuckContacts = (stuckResult.rows[0]?.count as number) ?? 0;

    const lastBroadcast =
      (lastBroadcastResult.rows[0]?.sent_at as string) ?? null;

    const totalUnsubscribes = (unsubResult.rows[0]?.count as number) ?? 0;

    const totalActive = (activeResult.rows[0]?.count as number) ?? 0;

    // Healthy if no stuck contacts and last broadcast was within 48h
    let broadcastRecent = false;
    if (lastBroadcast) {
      const broadcastTime = new Date(lastBroadcast + "Z").getTime();
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      broadcastRecent = broadcastTime > cutoff;
    }

    const healthy = stuckContacts === 0 && broadcastRecent;

    return NextResponse.json({
      groups,
      stuckContacts,
      lastBroadcast,
      totalUnsubscribes,
      totalActive,
      healthy,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
