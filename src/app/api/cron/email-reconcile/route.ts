import { db } from "@/lib/db";
import { authenticateEmailCallback } from "@/lib/hatchflow-email";
import { dripSource } from "@/lib/drip-delivery";
import { mirrorPendingUnsubscribes } from "@/lib/email-suppression";

export async function GET(request: Request) {
  if (!authenticateEmailCallback(request, process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const reconciled = await dripSource(db).reconcilePending();
  const suppressions = await mirrorPendingUnsubscribes(db);
  return Response.json({ ok: true, reconciled, suppressions });
}
