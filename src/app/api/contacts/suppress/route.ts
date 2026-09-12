import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mirrorPendingUnsubscribes, suppressDrip } from "@/lib/email-suppression";
import { authenticateEmailCallback } from "@/lib/hatchflow-email";

export async function POST(req: Request) {
  if (!authenticateEmailCallback(req, process.env.API_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const email = body.email?.trim()?.toLowerCase();
  const reason = body.reason || "manual";

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  await suppressDrip(db, email, reason);
  await mirrorPendingUnsubscribes(db);

  console.log(`[contacts] Suppressed ${email} (reason: ${reason})`);

  return NextResponse.json({ ok: true });
}
