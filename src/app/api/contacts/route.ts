import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.API_SECRET}`) {
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
