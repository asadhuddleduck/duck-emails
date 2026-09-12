import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TOTAL_EMAILS } from "@/lib/drip-templates";

export async function GET() {
  try {
    const [jobs, contacts, latest, mirrors] = await Promise.all([
      db.execute("SELECT status, COUNT(*) AS count FROM email_source_jobs GROUP BY status"),
      db.execute({
        sql: `SELECT
          COUNT(*) AS unfinished,
          SUM(CASE WHEN p.allowed = 1 AND p.evidence_ref IS NOT NULL THEN 1 ELSE 0 END) AS permissioned
          FROM drip_contact_state c
          LEFT JOIN email_marketing_permissions p ON p.email = c.email
          WHERE c.last_email_sent < ?
            AND NOT EXISTS (SELECT 1 FROM drip_unsubscribes u WHERE u.email = c.email)`,
        args: [TOTAL_EMAILS],
      }),
      db.execute("SELECT MAX(accepted_at) AS accepted_at FROM email_source_jobs WHERE status = 'accepted'"),
      db.execute("SELECT COUNT(*) AS count FROM email_source_suppressions WHERE mirrored_at IS NULL"),
    ]);
    const jobCounts = Object.fromEntries(jobs.rows.map((row) => [String(row.status), Number(row.count)]));
    const unfinished = Number(contacts.rows[0]?.unfinished ?? 0);
    const permissioned = Number(contacts.rows[0]?.permissioned ?? 0);
    const pendingSuppressionMirrors = Number(mirrors.rows[0]?.count ?? 0);
    // No eligible demand is normal. HatchFlow owns pacing, holds and provider health.
    return NextResponse.json({
      transport: "hatchflow",
      jobCounts,
      permissionedContacts: permissioned,
      heldForPermission: unfinished - permissioned,
      lastAcceptedAt: latest.rows[0]?.accepted_at ?? null,
      pendingSuppressionMirrors,
      healthy: !(jobCounts.uncertain || jobCounts.failed || pendingSuppressionMirrors),
    });
  } catch {
    return NextResponse.json({ healthy: false, error: "Email source health unavailable" }, { status: 503 });
  }
}
