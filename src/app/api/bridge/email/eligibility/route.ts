import { db } from "@/lib/db";
import { authenticateEmailCallback } from "@/lib/hatchflow-email";
import { dripEligibility, dripSource } from "@/lib/drip-delivery";

export async function POST(request: Request) {
  if (!authenticateEmailCallback(request, process.env.HATCHFLOW_EMAIL_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || body.source !== "duck-emails" || typeof body.sourceJobId !== "string") return Response.json({ error: "Invalid source job" }, { status: 400 });
  const saved = await dripSource(db).getJob(body.sourceJobId);
  if (!saved || saved.request.to !== body.to || saved.request.category !== body.category || saved.request.contentVersion !== body.contentVersion) {
    return Response.json({ eligible: false, reason: "saved_job_mismatch" });
  }
  return Response.json(await dripEligibility(db, saved.request));
}
