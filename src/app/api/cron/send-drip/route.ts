import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEmailTemplate, TOTAL_EMAILS } from "@/lib/drip-templates";
import { htmlToPlainText } from "@/lib/marketing-email";
import { authenticateEmailCallback } from "@/lib/hatchflow-email";
import { buildDripRequest, dripEligibility, dripSource } from "@/lib/drip-delivery";
import { mirrorPendingUnsubscribes } from "@/lib/email-suppression";

export const maxDuration = 300;

// This cron offers due work to HatchFlow. Only acceptance receipts advance a step.
export async function GET(request: Request) {
  if (!authenticateEmailCallback(request, process.env.CRON_SECRET)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = dripSource(db);
  await source.reconcilePending();
  await mirrorPendingUnsubscribes(db);
  const rows = await db.execute({
    sql: `SELECT cs.email, cs.last_email_sent FROM drip_contact_state cs
      JOIN email_marketing_permissions p ON p.email = lower(trim(cs.email)) AND p.allowed = 1
      WHERE cs.last_email_sent < ? AND p.evidence_ref != ''
        AND NOT EXISTS(SELECT 1 FROM drip_unsubscribes u WHERE lower(trim(u.email)) = lower(trim(cs.email)))
      ORDER BY cs.last_email_sent, cs.email LIMIT 200`, args: [TOTAL_EMAILS] });
  const counts = { accepted: 0, queued: 0, suppressed: 0, uncertain: 0, failed: 0, held: 0 };
  for (const row of rows.rows) {
    try {
      const emailNum = Number(row.last_email_sent) + 1;
      const template = getEmailTemplate(emailNum);
      const job = buildDripRequest({ email: String(row.email), emailNum, subject: template.subject,
        html: template.html, text: htmlToPlainText(template.html) });
      if (!(await dripEligibility(db, { ...job, source: "duck-emails" })).eligible) { counts.held++; continue; }
      const receipt = await source.submit(job);
      counts[receipt.status]++;
    } catch { counts.failed++; }
  }
  return NextResponse.json({ ok: counts.failed === 0, ...counts });
}
