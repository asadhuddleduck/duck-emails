import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateEmailCallback } from "@/lib/hatchflow-email";

export async function POST(req: Request) {
  if (!authenticateEmailCallback(req, process.env.API_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const email = body.email?.trim()?.toLowerCase();
  const source = body.source || "api";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Check if already suppressed or unsubscribed
  const excluded = await db.execute({
    sql: "SELECT email FROM drip_unsubscribes WHERE email = ?",
    args: [email],
  });
  if (excluded.rows.length > 0) {
    return NextResponse.json({ ok: true, status: "suppressed" });
  }

  // Capturing an address is not permission. Existing callers that only submit
  // an email still register a contact, but it remains held for marketing.
  if (body.marketingConsent === true) {
    const evidence = typeof body.consentEvidenceRef === "string" ? body.consentEvidenceRef.trim() : "";
    const recordedAt = typeof body.consentRecordedAt === "string" ? body.consentRecordedAt : "";
    if (!evidence || evidence.length > 1000 || !Number.isFinite(Date.parse(recordedAt)) || Date.parse(recordedAt) > Date.now()) {
      return NextResponse.json({ error: "Verified consent evidence and its recorded time are required" }, { status: 400 });
    }
    await db.execute({
      sql: `INSERT INTO email_marketing_permissions (email, allowed, evidence_ref, verified_at)
        VALUES (?, 1, ?, ?) ON CONFLICT(email) DO UPDATE SET allowed = 1,
        evidence_ref = excluded.evidence_ref, verified_at = excluded.verified_at, updated_at = CURRENT_TIMESTAMP`,
      args: [email, evidence, recordedAt],
    });
  }

  // Check if already in the drip sequence
  const existing = await db.execute({
    sql: "SELECT email FROM drip_contact_state WHERE email = ?",
    args: [email],
  });
  if (existing.rows.length > 0) {
    return NextResponse.json({ ok: true, status: "exists" });
  }

  // Add to drip sequence
  await db.execute({
    sql: "INSERT OR IGNORE INTO drip_contacts (email, cohort) VALUES (?, ?)",
    args: [email, source],
  });
  await db.execute({
    sql: "INSERT OR IGNORE INTO drip_contact_state (email, last_email_sent, last_sent_at) VALUES (?, 0, '')",
    args: [email],
  });

  console.log(`[contacts] Added ${email} to drip (source: ${source})`);

  return NextResponse.json({ ok: true, status: "added" });
}
